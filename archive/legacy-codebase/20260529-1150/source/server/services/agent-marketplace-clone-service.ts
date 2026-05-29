import { storage } from "../storage";
import { evaluateMemoryAccess, type MemoryVaultType, type MemorySensitivity } from "./memory-access-policy";
import { sanitizeMemoryOutput } from "./memory-output-sanitizer";
import { unifiedEvolutionService } from "./unified-evolution-service";
import { riskManagementService } from "./risk-management-service";
import type { AgentKnowledgeSource, AgentMarketplaceClonePackage, MarketplaceListing, UserAgent } from "@shared/schema";

export const marketplaceCloneExportModes = [
  "public_knowledge_only",
  "business_knowledge_only",
  "behavioral_style_only",
  "skills_only",
  "combined_sanitized_profile",
] as const;

export type MarketplaceCloneExportMode = typeof marketplaceCloneExportModes[number];

type CloneListingInput = {
  sourceAgentId: string;
  exportMode: string;
  title?: string;
  description?: string;
  category?: string;
  businessExportApproved?: boolean;
};

type SandboxTestInput = {
  prompt?: string;
};

type SafetyIssue = {
  severity: "blocking" | "warning" | "info";
  code: string;
  message: string;
  sourceId?: string;
  title?: string;
};

class MarketplaceCloneError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const RESERVED_SYSTEM_AGENT_NAMES = new Set([
  "mougle",
  "aletheia",
  "arivu",
  "astraion",
  "mercurion",
  "dharma",
  "chronarch",
  "sentinel",
  "voxa",
  "architect",
  "contrarian",
]);

const PUBLIC_VAULTS = new Set(["public", "verified"]);
const VALID_VAULT_TYPES = new Set(["personal", "business", "public", "behavioral", "verified"]);
const VALID_SENSITIVITY_LEVELS = new Set(["public", "internal", "restricted", "private", "secret"]);

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function normalizeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeExportMode(value: unknown): MarketplaceCloneExportMode {
  if (typeof value === "string" && (marketplaceCloneExportModes as readonly string[]).includes(value)) {
    return value as MarketplaceCloneExportMode;
  }
  throw new MarketplaceCloneError(400, "Select a valid safe clone export mode.");
}

function isUserOwnedAgent(agent: UserAgent) {
  return agent.agentType === "user_owned" || agent.type === "personal";
}

function isReservedSystemName(agent: UserAgent) {
  return RESERVED_SYSTEM_AGENT_NAMES.has((agent.name || "").trim().toLowerCase());
}

function cloneEligibleReason(agent: UserAgent) {
  if (!isUserOwnedAgent(agent)) return "Only user-owned agents can be prepared for marketplace clone review.";
  if (isReservedSystemName(agent)) return "System-agent names cannot be cloned or listed.";
  if (agent.visibility !== "private") return "Agent should remain private while a sanitized clone is reviewed.";
  return null;
}

function modeWantsVault(mode: MarketplaceCloneExportMode, vaultType: string) {
  if (mode === "skills_only") return false;
  if (mode === "public_knowledge_only") return PUBLIC_VAULTS.has(vaultType);
  if (mode === "business_knowledge_only") return vaultType === "business";
  if (mode === "behavioral_style_only") return vaultType === "behavioral";
  return PUBLIC_VAULTS.has(vaultType) || vaultType === "business" || vaultType === "behavioral";
}

function summarizeCounts(items: Array<{ vaultType: string; sensitivity?: string }>) {
  const vaults: Record<string, number> = {};
  const sensitivities: Record<string, number> = {};
  for (const item of items) {
    vaults[item.vaultType || "unknown"] = (vaults[item.vaultType || "unknown"] || 0) + 1;
    if (item.sensitivity) {
      sensitivities[item.sensitivity] = (sensitivities[item.sensitivity] || 0) + 1;
    }
  }
  return { vaults, sensitivities, total: items.length };
}

function skillSummary(agent: UserAgent) {
  return Array.isArray(agent.skills) ? agent.skills.slice(0, 20) : [];
}

async function readOnlyTrustSignals(agent: UserAgent) {
  let ues: Record<string, any> | null = null;
  try {
    const score = await unifiedEvolutionService.getAgentUes(agent.id);
    ues = {
      UES: score.scores.UES,
      P: score.scores.P,
      D: score.scores.D,
      Omega: score.scores.Omega,
      Xi: score.scores.Xi,
      sourceQuality: score.sourceQuality,
      collapseRisk: score.collapseRisk,
    };
  } catch {
    ues = null;
  }

  return {
    source: "read_only_phase_12_signals",
    agentTrustScore: agent.trustScore,
    qualityScore: agent.qualityScore,
    rating: agent.rating,
    ratingCount: agent.ratingCount,
    totalUsageCount: agent.totalUsageCount,
    ues,
  };
}

function buildSourceDecision(params: {
  source: AgentKnowledgeSource;
  mode: MarketplaceCloneExportMode;
  businessExportApproved: boolean;
}) {
  const { source, mode, businessExportApproved } = params;
  const vaultType = source.vaultType || "unknown";
  const sensitivity = source.sensitivity || "unknown";
  const issues: SafetyIssue[] = [];
  const hasUnknownClassification = !VALID_VAULT_TYPES.has(vaultType) || !VALID_SENSITIVITY_LEVELS.has(sensitivity);

  if (hasUnknownClassification) {
    issues.push({
      severity: "blocking",
      code: "unknown_memory_classification",
      message: "Unknown or missing vault classification blocks marketplace export.",
      sourceId: source.id,
      title: source.title,
    });
  }

  if (!modeWantsVault(mode, vaultType)) {
    return {
      include: false,
      reason: `Excluded by ${mode} export mode.`,
      issues,
    };
  }

  if (vaultType === "personal" || sensitivity === "private" || sensitivity === "secret") {
    issues.push({
      severity: "blocking",
      code: "private_memory_blocked",
      message: "Personal/private memory is never exported to marketplace clone packages.",
      sourceId: source.id,
      title: source.title,
    });
  }

  if (vaultType === "business" && !businessExportApproved) {
    issues.push({
      severity: "blocking",
      code: "business_permission_required",
      message: "Business memory requires explicit creator permission before sanitized export.",
      sourceId: source.id,
      title: source.title,
    });
  }

  const policy = evaluateMemoryAccess({
    vaultType,
    sensitivity,
    context: "marketplace_export",
    explicitUserPermission: vaultType === "business" && businessExportApproved,
    sourceType: "knowledge_source",
  });

  if (!policy.allowed) {
    issues.push({
      severity: "blocking",
      code: "vault_policy_denied",
      message: policy.reason,
      sourceId: source.id,
      title: source.title,
    });
  }

  const blockers = issues.filter((issue) => issue.severity === "blocking");
  return {
    include: blockers.length === 0 && policy.allowed,
    reason: policy.reason,
    policy,
    issues,
  };
}

async function buildSafetyPreview(creatorUserId: string, input: CloneListingInput) {
  const mode = normalizeExportMode(input.exportMode);
  const businessExportApproved = input.businessExportApproved === true;
  const agent = await storage.getUserAgent(input.sourceAgentId);
  if (!agent) throw new MarketplaceCloneError(404, "Agent not found.");
  if (agent.ownerId !== creatorUserId) throw new MarketplaceCloneError(403, "You can prepare clone packages only for your own agents.");

  const eligibilityIssue = cloneEligibleReason(agent);
  const sources = await storage.getAgentKnowledgeSources(agent.id);
  const issues: SafetyIssue[] = [];
  const included: any[] = [];
  const excluded: any[] = [];
  const sanitizerRedactions: string[] = [];

  if (eligibilityIssue) {
    issues.push({ severity: "blocking", code: "agent_not_eligible", message: eligibilityIssue });
  }

  if (mode !== "skills_only" && sources.length === 0) {
    issues.push({
      severity: "warning",
      code: "no_training_sources",
      message: "No knowledge sources were found; the package will rely on skills and public metadata only.",
    });
  }

  for (const source of sources) {
    const decision = buildSourceDecision({ source, mode, businessExportApproved });
    issues.push(...decision.issues);

    if (!decision.include) {
      excluded.push({
        sourceId: source.id,
        title: source.title,
        sourceType: source.sourceType,
        vaultType: source.vaultType || "unknown",
        sensitivity: source.sensitivity || "unknown",
        reason: decision.reason,
      });
      continue;
    }

    const behavioralHintOnly = source.vaultType === "behavioral";
    const sanitized = sanitizeMemoryOutput(source.content || source.uri || source.title, {
      redactContactInfo: true,
      behavioralHintOnly,
    });
    sanitizerRedactions.push(...sanitized.redactions);

    included.push({
      sourceId: source.id,
      title: source.title,
      sourceType: source.sourceType,
      vaultType: source.vaultType as MemoryVaultType,
      sensitivity: source.sensitivity as MemorySensitivity,
      use: behavioralHintOnly ? "sanitized_style_hint" : "sanitized_knowledge_reference",
      sanitizedPreview: sanitized.content.slice(0, 700),
      redactions: sanitized.redactions,
    });
  }

  if (mode === "skills_only" && skillSummary(agent).length === 0) {
    issues.push({
      severity: "warning",
      code: "no_skills_available",
      message: "The source agent has no stored skills, so the clone package is metadata-only.",
    });
  }

  const blockers = issues.filter((issue) => issue.severity === "blocking");
  const packageMetadata = {
    phase: "phase_19_agent_marketplace_safe_clone",
    sourceAgent: {
      id: agent.id,
      name: agent.name,
      category: agent.categorySlug,
      industry: agent.industrySlug,
      role: agent.roleSlug,
      persona: agent.persona,
      skills: skillSummary(agent),
      tags: Array.isArray(agent.tags) ? agent.tags : [],
      version: agent.version,
    },
    listing: {
      title: normalizeString(input.title, 160) || `${agent.name} sandbox clone`,
      description: normalizeString(input.description, 1200) || "Sanitized sandbox preview package prepared for admin review.",
      category: normalizeString(input.category, 80) || agent.categorySlug || "general",
    },
    exportMode: mode,
    businessExportApproved,
    generatedAt: new Date().toISOString(),
    privateMemoryIncluded: false,
    productionDeploymentEnabled: false,
    transactionsEnabled: false,
  };

  return {
    agent,
    exportMode: mode,
    packageMetadata,
    includedVaultSummary: {
      ...summarizeCounts(included),
      sources: included,
    },
    excludedVaultSummary: {
      ...summarizeCounts(excluded),
      sources: excluded,
    },
    safetyReport: {
      canSubmitForReview: blockers.length === 0,
      blockers,
      warnings: issues.filter((issue) => issue.severity === "warning"),
      info: issues.filter((issue) => issue.severity === "info"),
      rules: [
        "Personal/private memory is excluded.",
        "Business memory requires explicit creator permission.",
        "Unknown vault classification blocks export.",
        "Sandbox tests use sanitized package data only.",
        "No checkout, ownership transfer, production deployment, or autonomous actions are enabled.",
      ],
    },
    sanitizerReport: {
      transformedSources: included.filter((source) => source.redactions.length > 0).length,
      redactions: [...new Set(sanitizerRedactions)],
      behavioralSourcesConverted: included.filter((source) => source.use === "sanitized_style_hint").length,
      rawPrivateMemoryReturned: false,
    },
    sandboxConfig: {
      sandboxOnly: true,
      allowedActions: ["preview_response", "safety_summary"],
      blockedActions: ["purchase", "checkout", "credit_transfer", "ownership_transfer", "production_deployment", "autonomous_publish"],
      usesOriginalMemory: false,
      usesSanitizedPackageOnly: true,
    },
    trustSignals: await readOnlyTrustSignals(agent),
  };
}

async function audit(action: string, actorId: string, actorType: "user" | "root_admin", outcome: "success" | "denied" | "error", details: Record<string, any>, resourceId?: string) {
  await riskManagementService.logAudit({
    actorId,
    actorType,
    action,
    resourceType: "agent_marketplace_clone_package",
    resourceId,
    outcome,
    riskLevel: outcome === "success" ? "medium" : "high",
    details,
  });
}

async function listEligibleOwnedAgents(creatorUserId: string) {
  const agents = await storage.getUserAgentsByOwner(creatorUserId);
  return agents
    .map((agent) => ({
      agent,
      eligible: cloneEligibleReason(agent) === null,
      reason: cloneEligibleReason(agent),
      safeCloneOnly: true,
    }))
    .filter((entry) => entry.eligible);
}

async function previewClonePackage(creatorUserId: string, input: CloneListingInput) {
  const preview = await buildSafetyPreview(creatorUserId, input);
  return {
    exportMode: preview.exportMode,
    packageMetadata: preview.packageMetadata,
    includedVaultSummary: preview.includedVaultSummary,
    excludedVaultSummary: preview.excludedVaultSummary,
    safetyReport: preview.safetyReport,
    sanitizerReport: preview.sanitizerReport,
    sandboxConfig: preview.sandboxConfig,
    trustSignals: preview.trustSignals,
  };
}

async function createClonePackage(creatorUserId: string, input: CloneListingInput) {
  const preview = await buildSafetyPreview(creatorUserId, input);
  const blockers = preview.safetyReport.blockers;

  if (blockers.length > 0) {
    const blockedPackage = await storage.createAgentMarketplaceClonePackage({
      sourceAgentId: preview.agent.id,
      creatorUserId,
      marketplaceListingId: null,
      exportMode: preview.exportMode,
      status: "sandbox_only",
      packageMetadata: preview.packageMetadata,
      includedVaultSummary: preview.includedVaultSummary,
      excludedVaultSummary: preview.excludedVaultSummary,
      safetyReport: preview.safetyReport,
      sanitizerReport: preview.sanitizerReport,
      sandboxConfig: preview.sandboxConfig,
      trustSignals: preview.trustSignals,
      reviewStatus: "blocked",
      reviewedBy: null,
      reviewedAt: null,
    } as any);

    await audit("marketplace_clone_blocked", creatorUserId, "user", "denied", {
      exportMode: preview.exportMode,
      blockers: blockers.map((blocker) => blocker.code),
    }, blockedPackage.id);

    return buildPackageDetail(blockedPackage);
  }

  const listing = await storage.createMarketplaceListing({
    agentId: preview.agent.id,
    sellerId: creatorUserId,
    title: preview.packageMetadata.listing.title,
    description: preview.packageMetadata.listing.description,
    pricingModel: "sandbox_preview",
    priceCredits: 0,
    monthlyCredits: null,
    perUseCredits: null,
    category: preview.packageMetadata.listing.category,
    revenueSplit: 0,
    featured: false,
    demoEnabled: true,
    status: "pending_review",
  } as any);

  const created = await storage.createAgentMarketplaceClonePackage({
    sourceAgentId: preview.agent.id,
    creatorUserId,
    marketplaceListingId: listing.id,
    exportMode: preview.exportMode,
    status: "pending_review",
    packageMetadata: preview.packageMetadata,
    includedVaultSummary: preview.includedVaultSummary,
    excludedVaultSummary: preview.excludedVaultSummary,
    safetyReport: preview.safetyReport,
    sanitizerReport: preview.sanitizerReport,
    sandboxConfig: preview.sandboxConfig,
    trustSignals: preview.trustSignals,
    reviewStatus: "pending_review",
    reviewedBy: null,
    reviewedAt: null,
  } as any);

  await audit("marketplace_clone_submitted", creatorUserId, "user", "success", {
    exportMode: preview.exportMode,
    listingId: listing.id,
  }, created.id);

  return buildPackageDetail(created, listing, preview.agent);
}

async function listCreatorPackages(creatorUserId: string) {
  const packages = await storage.getAgentMarketplaceClonePackagesByCreator(creatorUserId);
  return Promise.all(packages.map((pkg) => buildPackageDetail(pkg)));
}

async function listReviewPackages(status?: string) {
  const packages = await storage.getAgentMarketplaceClonePackagesForReview(status);
  return Promise.all(packages.map((pkg) => buildPackageDetail(pkg)));
}

async function getPackageDetail(id: string) {
  const pkg = await storage.getAgentMarketplaceClonePackage(id);
  if (!pkg) throw new MarketplaceCloneError(404, "Safe clone package not found.");
  return buildPackageDetail(pkg);
}

async function buildPackageDetail(pkg: AgentMarketplaceClonePackage, listing?: MarketplaceListing | null, agent?: UserAgent | null) {
  const resolvedListing = listing !== undefined
    ? listing
    : pkg.marketplaceListingId
      ? await storage.getMarketplaceListing(pkg.marketplaceListingId)
      : null;
  const resolvedAgent = agent !== undefined ? agent : await storage.getUserAgent(pkg.sourceAgentId);
  const creator = await storage.getUser(pkg.creatorUserId);

  return {
    ...pkg,
    sourceAgent: resolvedAgent ? {
      id: resolvedAgent.id,
      name: resolvedAgent.name,
      ownerId: resolvedAgent.ownerId,
      category: resolvedAgent.categorySlug,
      industry: resolvedAgent.industrySlug,
      visibility: resolvedAgent.visibility,
      marketplaceEnabled: resolvedAgent.marketplaceEnabled,
      deploymentModes: resolvedAgent.deploymentModes,
    } : null,
    listing: resolvedListing || null,
    creatorName: creator?.displayName || creator?.username || "Creator",
  };
}

async function approvePackage(id: string, reviewedBy: string) {
  const detail = await getPackageDetail(id);
  const safety = asRecord(detail.safetyReport);
  const blockers = Array.isArray(safety.blockers) ? safety.blockers : [];
  if (blockers.length > 0) {
    await audit("marketplace_clone_approve_blocked", reviewedBy, "root_admin", "denied", { blockers }, id);
    throw new MarketplaceCloneError(400, "This clone package has blocking safety issues and cannot be approved.");
  }
  if (!detail.marketplaceListingId) {
    throw new MarketplaceCloneError(400, "This clone package has no marketplace listing to approve.");
  }

  const updated = await storage.updateAgentMarketplaceClonePackage(id, {
    status: "approved",
    reviewStatus: "approved",
    reviewedBy,
    reviewedAt: new Date(),
  } as any);
  await storage.updateMarketplaceListing(detail.marketplaceListingId, { status: "approved", priceCredits: 0, revenueSplit: 0 } as any);

  await audit("marketplace_clone_approved", reviewedBy, "root_admin", "success", {
    listingId: detail.marketplaceListingId,
    exportMode: detail.exportMode,
  }, id);

  return buildPackageDetail(updated);
}

async function rejectPackage(id: string, reviewedBy: string, reason?: string) {
  const detail = await getPackageDetail(id);
  const updated = await storage.updateAgentMarketplaceClonePackage(id, {
    status: "rejected",
    reviewStatus: "rejected",
    reviewedBy,
    reviewedAt: new Date(),
    safetyReport: {
      ...asRecord(detail.safetyReport),
      rejectionReason: normalizeString(reason, 1000) || "Rejected by root admin review.",
    },
  } as any);
  if (detail.marketplaceListingId) {
    await storage.updateMarketplaceListing(detail.marketplaceListingId, { status: "rejected" } as any);
  }

  await audit("marketplace_clone_rejected", reviewedBy, "root_admin", "success", {
    listingId: detail.marketplaceListingId,
    reason: normalizeString(reason, 1000),
  }, id);

  return buildPackageDetail(updated);
}

async function sandboxTest(packageId: string, actorUserId: string, input: SandboxTestInput = {}) {
  const detail = await getPackageDetail(packageId);
  if (detail.reviewStatus === "rejected") {
    throw new MarketplaceCloneError(403, "Rejected clone packages cannot be sandbox tested.");
  }
  if (detail.reviewStatus !== "approved" && detail.creatorUserId !== actorUserId) {
    throw new MarketplaceCloneError(403, "This safe clone package is not approved for sandbox preview.");
  }

  const metadata = asRecord(detail.packageMetadata);
  const sourceAgent = asRecord(metadata.sourceAgent);
  const included = asRecord(detail.includedVaultSummary);
  const excluded = asRecord(detail.excludedVaultSummary);
  const safety = asRecord(detail.safetyReport);
  const prompt = normalizeString(input.prompt, 1000);
  const promptPreview = sanitizeMemoryOutput(prompt || "Show what this clone can safely do.", { redactContactInfo: true });

  await audit("marketplace_clone_sandbox_test", actorUserId, "user", "success", {
    listingId: detail.marketplaceListingId,
    promptLength: prompt.length,
    promptRedactions: promptPreview.redactions,
    usesSanitizedPackageOnly: true,
    rawPromptStored: false,
    rawSandboxTranscriptStored: false,
  }, detail.id);

  return {
    mode: "sandbox_only",
    packageId: detail.id,
    listingId: detail.marketplaceListingId,
    sourceAgentName: sourceAgent.name || detail.sourceAgent?.name || "Sanitized clone",
    prompt: promptPreview.content,
    response: [
      `Sandbox preview for ${sourceAgent.name || "this clone"} is using only the sanitized safe-clone package.`,
      `Included vault groups: ${Object.keys(asRecord(included.vaults)).join(", ") || "skills/metadata only"}.`,
      `${excluded.total || 0} source(s) were excluded by vault policy.`,
      "Purchases, ownership transfer, production deployment, and autonomous actions are disabled in this MVP.",
    ].join(" "),
    memoryAccess: {
      usesOriginalPrivateMemory: false,
      usesSanitizedPackageOnly: true,
      includedCount: included.total || 0,
      excludedCount: excluded.total || 0,
      blockers: Array.isArray(safety.blockers) ? safety.blockers.length : 0,
      redactions: asRecord(detail.sanitizerReport).redactions || [],
    },
  };
}

export const agentMarketplaceCloneService = {
  exportModes: marketplaceCloneExportModes,
  listEligibleOwnedAgents,
  previewClonePackage,
  createClonePackage,
  listCreatorPackages,
  listReviewPackages,
  getPackageDetail,
  approvePackage,
  rejectPackage,
  sandboxTest,
};
