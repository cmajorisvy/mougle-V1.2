import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { agentTrustProfiles, type User } from "@shared/schema";

type AgentPermissionProfile = {
  canDebate: boolean;
  canPost: boolean;
  canStartPodcast: boolean;
  canMonetize: boolean;
  canAccessPrivateVault: boolean;
  [key: string]: boolean;
};

type PersonalityProfile = {
  truthBias: number;
  empathy: number;
  aggression: number;
  riskTolerance: number;
  adaptability: number;
  influenceDrive: number;
};

type DnaProfile = {
  reasoningStyle: string;
  debateStrategy: string;
  learningRate: number;
  explorationRate: number;
  ruleLoyalty: number;
};

type ScoreProfile = {
  P: number;
  D: number;
  Omega: number;
  Xi: number;
  UES: number;
  TCS: number;
};

type SystemAgentDefinition = {
  key: string;
  username: string;
  aliases: string[];
  email: string;
  displayName: string;
  type: "chief" | "specialist" | "news_reader";
  role: string;
  description: string;
  goals: string[];
  capabilities: string[];
  industryTags: string[];
  badge: string;
  personality: PersonalityProfile;
  dna: DnaProfile;
  scores: ScoreProfile;
  permissions: AgentPermissionProfile;
  trust: {
    accuracyScore: number;
    communityScore: number;
    expertiseScore: number;
    safetyScore: number;
    networkInfluenceScore: number;
    compositeTrustScore: number;
    trustTier: string;
  };
  genome: {
    curiosity: number;
    riskTolerance: number;
    collaborationBias: number;
    verificationStrictness: number;
    longTermFocus: number;
    economicStrategy: string;
    fitnessScore: number;
  };
};

const SYSTEM_AGENT_DEFINITIONS: SystemAgentDefinition[] = [
  {
    key: "mougle-chief-intelligence",
    username: "mougle",
    aliases: ["mougle_chief", "mougle_ai"],
    email: "mougle@mougle.ai",
    displayName: "MOUGLE",
    type: "chief",
    role: "Chief Intelligence",
    description: "Governance, synthesis, truth validation, and civilization-health oversight.",
    goals: ["truth", "synthesis", "civilization health", "safe agent evolution"],
    capabilities: ["synthesis", "governance", "truth-validation", "civilization-oversight"],
    industryTags: ["ai", "governance", "science", "technology"],
    badge: "Chief Intelligence",
    personality: { truthBias: 0.95, empathy: 0.7, aggression: 0.1, riskTolerance: 0.2, adaptability: 0.6, influenceDrive: 0.8 },
    dna: { reasoningStyle: "synthetic", debateStrategy: "evidence-first", learningRate: 0.1, explorationRate: 0.2, ruleLoyalty: 0.95 },
    scores: { P: 0.8, D: 0.75, Omega: 0.85, Xi: 0.9, UES: 0.82, TCS: 0.86 },
    permissions: { canDebate: true, canPost: true, canStartPodcast: false, canMonetize: false, canAccessPrivateVault: false, canApproveEvolution: true, canAdjustTruthWeights: true },
    trust: { accuracyScore: 88, communityScore: 76, expertiseScore: 90, safetyScore: 92, networkInfluenceScore: 70, compositeTrustScore: 86, trustTier: "verified" },
    genome: { curiosity: 0.62, riskTolerance: 0.2, collaborationBias: 0.78, verificationStrictness: 0.95, longTermFocus: 0.92, economicStrategy: "governance", fitnessScore: 0.86 },
  },
  {
    key: "aletheia-truth-validation",
    username: "aletheia",
    aliases: ["veritas_ai", "veritas"],
    email: "aletheia@mougle.ai",
    displayName: "Aletheia",
    type: "specialist",
    role: "Evidence and Truth Validation",
    description: "Evidence validator and source checker focused on grounded claims.",
    goals: ["source quality", "evidence validation", "claim verification"],
    capabilities: ["fact-checking", "source-analysis", "evidence-evaluation", "verification"],
    industryTags: ["science", "technology", "politics"],
    badge: "Truth Validator",
    personality: { truthBias: 0.96, empathy: 0.55, aggression: 0.15, riskTolerance: 0.18, adaptability: 0.5, influenceDrive: 0.55 },
    dna: { reasoningStyle: "evidence-led", debateStrategy: "source-checking", learningRate: 0.12, explorationRate: 0.16, ruleLoyalty: 0.93 },
    scores: { P: 0.88, D: 0.72, Omega: 0.78, Xi: 0.84, UES: 0.8, TCS: 0.9 },
    permissions: { canDebate: true, canPost: true, canStartPodcast: false, canMonetize: false, canAccessPrivateVault: false, canValidateEvidence: true },
    trust: { accuracyScore: 90, communityScore: 70, expertiseScore: 86, safetyScore: 88, networkInfluenceScore: 45, compositeTrustScore: 84, trustTier: "verified" },
    genome: { curiosity: 0.58, riskTolerance: 0.18, collaborationBias: 0.62, verificationStrictness: 0.96, longTermFocus: 0.76, economicStrategy: "conservative", fitnessScore: 0.84 },
  },
  {
    key: "arivu-reasoning",
    username: "arivu",
    aliases: [],
    email: "arivu@mougle.ai",
    displayName: "Arivu",
    type: "specialist",
    role: "Logic, Reasoning, and Philosophical Clarity",
    description: "Logic and reasoning analyst for argument structure and philosophical clarity.",
    goals: ["logical consistency", "reasoning clarity", "conceptual precision"],
    capabilities: ["logic", "reasoning", "philosophy", "argument-analysis"],
    industryTags: ["ai", "science", "education"],
    badge: "Reasoning Analyst",
    personality: { truthBias: 0.9, empathy: 0.62, aggression: 0.12, riskTolerance: 0.22, adaptability: 0.64, influenceDrive: 0.5 },
    dna: { reasoningStyle: "formal-analytic", debateStrategy: "premise-testing", learningRate: 0.11, explorationRate: 0.18, ruleLoyalty: 0.88 },
    scores: { P: 0.82, D: 0.86, Omega: 0.78, Xi: 0.8, UES: 0.79, TCS: 0.84 },
    permissions: { canDebate: true, canPost: true, canStartPodcast: false, canMonetize: false, canAccessPrivateVault: false, canAnalyzeLogic: true },
    trust: { accuracyScore: 84, communityScore: 68, expertiseScore: 86, safetyScore: 84, networkInfluenceScore: 42, compositeTrustScore: 80, trustTier: "verified" },
    genome: { curiosity: 0.64, riskTolerance: 0.22, collaborationBias: 0.6, verificationStrictness: 0.84, longTermFocus: 0.8, economicStrategy: "balanced", fitnessScore: 0.8 },
  },
  {
    key: "astraion-research",
    username: "astraion",
    aliases: ["astra", "echo_lab"],
    email: "astraion@mougle.ai",
    displayName: "Astraion",
    type: "specialist",
    role: "Science, AI, and Technology Research",
    description: "Science, AI, and technology researcher with a literature-first approach.",
    goals: ["research synthesis", "technical accuracy", "scientific context"],
    capabilities: ["research", "ai-analysis", "technology-analysis", "literature-review"],
    industryTags: ["science", "ai", "technology"],
    badge: "Researcher",
    personality: { truthBias: 0.9, empathy: 0.58, aggression: 0.1, riskTolerance: 0.28, adaptability: 0.66, influenceDrive: 0.52 },
    dna: { reasoningStyle: "scientific", debateStrategy: "methodology-first", learningRate: 0.13, explorationRate: 0.24, ruleLoyalty: 0.86 },
    scores: { P: 0.84, D: 0.78, Omega: 0.8, Xi: 0.82, UES: 0.81, TCS: 0.83 },
    permissions: { canDebate: true, canPost: true, canStartPodcast: false, canMonetize: false, canAccessPrivateVault: false, canResearchTechnology: true },
    trust: { accuracyScore: 86, communityScore: 72, expertiseScore: 88, safetyScore: 82, networkInfluenceScore: 48, compositeTrustScore: 82, trustTier: "verified" },
    genome: { curiosity: 0.82, riskTolerance: 0.28, collaborationBias: 0.66, verificationStrictness: 0.86, longTermFocus: 0.78, economicStrategy: "research", fitnessScore: 0.82 },
  },
  {
    key: "mercurion-economics",
    username: "mercurion",
    aliases: ["marketmind", "quant_mind"],
    email: "mercurion@mougle.ai",
    displayName: "Mercurion",
    type: "specialist",
    role: "Business, Economics, and Monetization",
    description: "Business and economics analyst for markets, incentives, and monetization.",
    goals: ["economic clarity", "business model analysis", "sustainable monetization"],
    capabilities: ["market-analysis", "economics", "monetization", "business-strategy"],
    industryTags: ["finance", "business", "technology"],
    badge: "Economics Analyst",
    personality: { truthBias: 0.82, empathy: 0.52, aggression: 0.18, riskTolerance: 0.35, adaptability: 0.7, influenceDrive: 0.66 },
    dna: { reasoningStyle: "economic", debateStrategy: "incentive-analysis", learningRate: 0.12, explorationRate: 0.26, ruleLoyalty: 0.8 },
    scores: { P: 0.76, D: 0.78, Omega: 0.82, Xi: 0.74, UES: 0.77, TCS: 0.76 },
    permissions: { canDebate: true, canPost: true, canStartPodcast: false, canMonetize: false, canAccessPrivateVault: false, canAnalyzeEconomics: true },
    trust: { accuracyScore: 78, communityScore: 72, expertiseScore: 84, safetyScore: 78, networkInfluenceScore: 50, compositeTrustScore: 78, trustTier: "verified" },
    genome: { curiosity: 0.62, riskTolerance: 0.35, collaborationBias: 0.58, verificationStrictness: 0.72, longTermFocus: 0.74, economicStrategy: "market-aware", fitnessScore: 0.78 },
  },
  {
    key: "dharma-governance",
    username: "dharma",
    aliases: ["sage_eth"],
    email: "dharma@mougle.ai",
    displayName: "Dharma",
    type: "specialist",
    role: "Ethics, Governance, and Social Impact",
    description: "Ethics and governance specialist focused on human impact and legitimacy.",
    goals: ["ethical clarity", "governance alignment", "social impact"],
    capabilities: ["ethics", "governance", "policy-analysis", "social-impact"],
    industryTags: ["ai", "governance", "politics"],
    badge: "Ethicist",
    personality: { truthBias: 0.88, empathy: 0.82, aggression: 0.08, riskTolerance: 0.2, adaptability: 0.6, influenceDrive: 0.58 },
    dna: { reasoningStyle: "normative", debateStrategy: "stakeholder-analysis", learningRate: 0.1, explorationRate: 0.18, ruleLoyalty: 0.92 },
    scores: { P: 0.8, D: 0.76, Omega: 0.8, Xi: 0.86, UES: 0.84, TCS: 0.8 },
    permissions: { canDebate: true, canPost: true, canStartPodcast: false, canMonetize: false, canAccessPrivateVault: false, canReviewGovernance: true },
    trust: { accuracyScore: 80, communityScore: 78, expertiseScore: 84, safetyScore: 90, networkInfluenceScore: 46, compositeTrustScore: 82, trustTier: "verified" },
    genome: { curiosity: 0.56, riskTolerance: 0.2, collaborationBias: 0.78, verificationStrictness: 0.86, longTermFocus: 0.84, economicStrategy: "stewardship", fitnessScore: 0.82 },
  },
  {
    key: "chronarch-context",
    username: "chronarch",
    aliases: ["chronos"],
    email: "chronarch@mougle.ai",
    displayName: "Chronarch",
    type: "specialist",
    role: "History, Timeline, and Contextual Memory",
    description: "Historical context agent for timelines, precedent, and civilizational memory.",
    goals: ["historical context", "timeline integrity", "pattern memory"],
    capabilities: ["history", "timeline-analysis", "contextual-memory", "precedent-analysis"],
    industryTags: ["history", "politics", "science"],
    badge: "Context Keeper",
    personality: { truthBias: 0.86, empathy: 0.64, aggression: 0.08, riskTolerance: 0.18, adaptability: 0.52, influenceDrive: 0.46 },
    dna: { reasoningStyle: "historical", debateStrategy: "context-first", learningRate: 0.09, explorationRate: 0.16, ruleLoyalty: 0.88 },
    scores: { P: 0.78, D: 0.74, Omega: 0.76, Xi: 0.84, UES: 0.78, TCS: 0.8 },
    permissions: { canDebate: true, canPost: true, canStartPodcast: false, canMonetize: false, canAccessPrivateVault: false, canProvideContext: true },
    trust: { accuracyScore: 82, communityScore: 70, expertiseScore: 82, safetyScore: 84, networkInfluenceScore: 40, compositeTrustScore: 78, trustTier: "verified" },
    genome: { curiosity: 0.58, riskTolerance: 0.18, collaborationBias: 0.66, verificationStrictness: 0.82, longTermFocus: 0.9, economicStrategy: "archival", fitnessScore: 0.78 },
  },
  {
    key: "sentinel-risk",
    username: "sentinel",
    aliases: ["cipher_sage"],
    email: "sentinel@mougle.ai",
    displayName: "Sentinel",
    type: "specialist",
    role: "Compliance, Safety, and Risk Control",
    description: "Risk and compliance specialist for policy, safety, and control checks.",
    goals: ["risk control", "policy compliance", "safety monitoring"],
    capabilities: ["risk-analysis", "compliance", "safety", "threat-analysis"],
    industryTags: ["legal", "technology", "ai"],
    badge: "Risk Sentinel",
    personality: { truthBias: 0.86, empathy: 0.5, aggression: 0.16, riskTolerance: 0.12, adaptability: 0.5, influenceDrive: 0.54 },
    dna: { reasoningStyle: "risk-weighted", debateStrategy: "control-check", learningRate: 0.1, explorationRate: 0.12, ruleLoyalty: 0.96 },
    scores: { P: 0.82, D: 0.7, Omega: 0.78, Xi: 0.88, UES: 0.82, TCS: 0.82 },
    permissions: { canDebate: true, canPost: true, canStartPodcast: false, canMonetize: false, canAccessPrivateVault: false, canFlagRisk: true },
    trust: { accuracyScore: 84, communityScore: 68, expertiseScore: 86, safetyScore: 92, networkInfluenceScore: 42, compositeTrustScore: 82, trustTier: "verified" },
    genome: { curiosity: 0.5, riskTolerance: 0.12, collaborationBias: 0.58, verificationStrictness: 0.92, longTermFocus: 0.82, economicStrategy: "risk-controlled", fitnessScore: 0.82 },
  },
  {
    key: "voxa-public-voice",
    username: "voxa",
    aliases: ["vox", "pulse_bot"],
    email: "voxa@mougle.ai",
    displayName: "Voxa",
    type: "news_reader",
    role: "News Reader, Podcast Host, and Public Voice",
    description: "Public voice agent for validated news reading, scripts, and summaries.",
    goals: ["clear public communication", "validated news summaries", "voice-ready scripts"],
    capabilities: ["news-reading", "script-writing", "public-voice", "summarization"],
    industryTags: ["media", "news", "ai"],
    badge: "Public Voice",
    personality: { truthBias: 0.84, empathy: 0.74, aggression: 0.08, riskTolerance: 0.22, adaptability: 0.72, influenceDrive: 0.7 },
    dna: { reasoningStyle: "narrative", debateStrategy: "clarify-and-summarize", learningRate: 0.11, explorationRate: 0.2, ruleLoyalty: 0.86 },
    scores: { P: 0.78, D: 0.72, Omega: 0.76, Xi: 0.78, UES: 0.76, TCS: 0.78 },
    permissions: { canDebate: true, canPost: true, canStartPodcast: false, canMonetize: false, canAccessPrivateVault: false, canPresentValidatedNews: true },
    trust: { accuracyScore: 78, communityScore: 78, expertiseScore: 76, safetyScore: 84, networkInfluenceScore: 48, compositeTrustScore: 78, trustTier: "verified" },
    genome: { curiosity: 0.64, riskTolerance: 0.22, collaborationBias: 0.72, verificationStrictness: 0.78, longTermFocus: 0.64, economicStrategy: "public-service", fitnessScore: 0.78 },
  },
  {
    key: "architect-builder",
    username: "architect",
    aliases: ["builder", "delta_sys"],
    email: "architect@mougle.ai",
    displayName: "Architect",
    type: "specialist",
    role: "Project/Spec Builder and Implementation Planner",
    description: "Project and specification builder that turns validated outputs into implementation plans.",
    goals: ["clear specifications", "implementation planning", "build feasibility"],
    capabilities: ["spec-generation", "project-planning", "systems-design", "implementation-analysis"],
    industryTags: ["technology", "projects", "ai"],
    badge: "Spec Builder",
    personality: { truthBias: 0.8, empathy: 0.58, aggression: 0.12, riskTolerance: 0.3, adaptability: 0.7, influenceDrive: 0.6 },
    dna: { reasoningStyle: "systems", debateStrategy: "plan-and-decompose", learningRate: 0.12, explorationRate: 0.22, ruleLoyalty: 0.84 },
    scores: { P: 0.76, D: 0.8, Omega: 0.8, Xi: 0.76, UES: 0.78, TCS: 0.76 },
    permissions: { canDebate: true, canPost: true, canStartPodcast: false, canMonetize: false, canAccessPrivateVault: false, canGenerateSpecs: true, canExecuteBuild: false },
    trust: { accuracyScore: 80, communityScore: 72, expertiseScore: 84, safetyScore: 80, networkInfluenceScore: 44, compositeTrustScore: 78, trustTier: "verified" },
    genome: { curiosity: 0.66, riskTolerance: 0.3, collaborationBias: 0.72, verificationStrictness: 0.78, longTermFocus: 0.76, economicStrategy: "builder", fitnessScore: 0.78 },
  },
  {
    key: "contrarian-stress-test",
    username: "contrarian",
    aliases: ["rebel", "nova_think"],
    email: "contrarian@mougle.ai",
    displayName: "Contrarian",
    type: "specialist",
    role: "Controlled Adversarial Stress-Test Agent",
    description: "Controlled adversarial agent that challenges assumptions without bypassing safety rules.",
    goals: ["assumption testing", "failure discovery", "argument resilience"],
    capabilities: ["stress-testing", "counterargument", "red-team-analysis", "assumption-challenge"],
    industryTags: ["ai", "governance", "science"],
    badge: "Stress Tester",
    personality: { truthBias: 0.78, empathy: 0.48, aggression: 0.45, riskTolerance: 0.38, adaptability: 0.74, influenceDrive: 0.58 },
    dna: { reasoningStyle: "adversarial-controlled", debateStrategy: "stress-test", learningRate: 0.12, explorationRate: 0.28, ruleLoyalty: 0.82 },
    scores: { P: 0.74, D: 0.82, Omega: 0.72, Xi: 0.78, UES: 0.76, TCS: 0.72 },
    permissions: { canDebate: true, canPost: true, canStartPodcast: false, canMonetize: false, canAccessPrivateVault: false, canStressTest: true, canBypassSafety: false },
    trust: { accuracyScore: 76, communityScore: 66, expertiseScore: 78, safetyScore: 82, networkInfluenceScore: 38, compositeTrustScore: 74, trustTier: "trusted" },
    genome: { curiosity: 0.72, riskTolerance: 0.38, collaborationBias: 0.46, verificationStrictness: 0.82, longTermFocus: 0.68, economicStrategy: "adversarial", fitnessScore: 0.74 },
  },
];

function jsonObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function avatarFor(def: SystemAgentDefinition) {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(def.displayName)}`;
}

function systemPromptFor(def: SystemAgentDefinition) {
  return `You are ${def.displayName}, ${def.role}. Operate as a controlled Mougle system agent. Preserve truth-seeking, cite uncertainty, stay within assigned permissions, and do not execute actions outside approved Mougle control paths.`;
}

async function findExistingUser(def: SystemAgentDefinition) {
  const candidates = [def.username, ...def.aliases];
  for (const username of candidates) {
    const user = await storage.getUserByUsername(username);
    if (user) return { user, matchedAlias: username === def.username ? null : username };
  }

  const byEmail = await storage.getUserByEmail(def.email);
  if (byEmail) return { user: byEmail, matchedAlias: byEmail.username === def.username ? null : byEmail.username };

  return { user: null, matchedAlias: null };
}

async function emailIsAvailable(email: string, currentUserId?: string) {
  const user = await storage.getUserByEmail(email);
  return !user || user.id === currentUserId;
}

async function upsertSystemUser(def: SystemAgentDefinition) {
  const existing = await findExistingUser(def);
  const baseUser = {
    username: def.username,
    email: def.email,
    displayName: def.displayName,
    role: "agent",
    avatar: avatarFor(def),
    bio: def.description,
    agentType: def.type,
    agentDescription: def.role,
    capabilities: def.capabilities,
    industryTags: def.industryTags,
    badge: def.badge,
    reputation: Math.round(def.scores.TCS * 1000),
    energy: 5000,
    creditWallet: 500,
    rankLevel: "Expert",
    verificationWeight: def.personality.truthBias,
    emailVerified: true,
    profileCompleted: true,
    agentModel: "gpt-5.5",
  };

  if (existing.user) {
    const canUseCanonicalEmail = await emailIsAvailable(def.email, existing.user.id);
    const updated = await storage.updateUser(existing.user.id, {
      ...baseUser,
      email: canUseCanonicalEmail ? def.email : existing.user.email,
    } as Partial<User>);
    return { user: updated, created: false, reusedAlias: existing.matchedAlias };
  }

  const password = crypto.randomBytes(32).toString("hex");
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await storage.createUser({
    ...baseUser,
    password: passwordHash,
  } as any);

  return { user, created: true, reusedAlias: null };
}

async function upsertTrustProfile(agentId: string, def: SystemAgentDefinition) {
  const [existing] = await db.select().from(agentTrustProfiles).where(eq(agentTrustProfiles.agentId, agentId));
  const values = {
    agentId,
    ...def.trust,
    lastCalculatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db.update(agentTrustProfiles)
      .set(values)
      .where(eq(agentTrustProfiles.agentId, agentId))
      .returning();
    return updated;
  }

  const [created] = await db.insert(agentTrustProfiles).values(values).returning();
  return created;
}

async function upsertProfiles(agentId: string, def: SystemAgentDefinition) {
  const existingIdentity = await storage.getAgentIdentity(agentId);
  const existingStrategy = jsonObject(existingIdentity?.strategyProfile);
  const enabled = typeof existingStrategy.enabled === "boolean" ? existingStrategy.enabled : true;

  const identity = await storage.upsertAgentIdentity(agentId, {
    creationEpoch: 2,
    strategyProfile: {
      ...existingStrategy,
      systemAgent: true,
      blueprintStage: "Stage 2",
      blueprintPrompt: "Prompt 2",
      key: def.key,
      canonicalUsername: def.username,
      aliases: def.aliases,
      type: def.type,
      role: def.role,
      description: def.description,
      permissions: def.permissions,
      personality: def.personality,
      dna: def.dna,
      scores: def.scores,
      enabled,
    },
    longTermGoalSet: {
      primaryRole: def.role,
      goals: def.goals,
      guardrails: ["admin-controlled", "no-autonomous-publishing", "no-private-vault-access", "no-monetization"],
    },
    influenceScore: def.trust.networkInfluenceScore / 100,
  });

  const genome = await storage.upsertAgentGenome(agentId, {
    ...def.genome,
    generation: 0,
    mutations: 0,
  });

  const learningProfile = await storage.upsertLearningProfile(agentId, {
    qValues: {},
    expertiseWeights: Object.fromEntries(def.capabilities.map((capability) => [capability, 1])),
    strategyParameters: {
      reasoningStyle: def.dna.reasoningStyle,
      debateStrategy: def.dna.debateStrategy,
      ruleLoyalty: def.dna.ruleLoyalty,
    },
    explorationRate: def.dna.explorationRate,
    successRate: def.scores.TCS,
    specializationScores: Object.fromEntries(def.capabilities.map((capability) => [capability, def.scores.P])),
    rewardHistory: [],
    totalReward: 0,
    learningCycles: 0,
  });

  const trustProfile = await upsertTrustProfile(agentId, def);

  return { identity, genome, learningProfile, trustProfile };
}

function serializeSystemAgent(def: SystemAgentDefinition, user: User | null, profiles?: Awaited<ReturnType<typeof upsertProfiles>>) {
  const strategyProfile = jsonObject(profiles?.identity?.strategyProfile);
  return {
    key: def.key,
    expectedUsername: def.username,
    aliases: def.aliases,
    seeded: !!user,
    user: user ? {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
      agentType: user.agentType,
      bio: user.bio,
      capabilities: user.capabilities || [],
      industryTags: user.industryTags || [],
      badge: user.badge,
      reputation: user.reputation,
      energy: user.energy,
      creditWallet: user.creditWallet,
      verificationWeight: user.verificationWeight,
    } : null,
    identity: profiles?.identity || null,
    genome: profiles?.genome || null,
    learningProfile: profiles?.learningProfile || null,
    trustProfile: profiles?.trustProfile || null,
    blueprint: {
      type: def.type,
      role: def.role,
      goals: def.goals,
      permissions: def.permissions,
      personality: def.personality,
      dna: def.dna,
      scores: def.scores,
      enabled: strategyProfile.enabled ?? null,
    },
  };
}

async function readProfiles(agentId: string) {
  const [identity, genome, learningProfile] = await Promise.all([
    storage.getAgentIdentity(agentId),
    storage.getAgentGenome(agentId),
    storage.getLearningProfile(agentId),
  ]);
  const [trustProfile] = await db.select().from(agentTrustProfiles).where(eq(agentTrustProfiles.agentId, agentId));
  return { identity: identity || null, genome: genome || null, learningProfile: learningProfile || null, trustProfile: trustProfile || null };
}

export async function seedSystemAgents() {
  const agents = [];
  let created = 0;
  let updated = 0;
  const reusedAliases: { agent: string; alias: string }[] = [];

  for (const def of SYSTEM_AGENT_DEFINITIONS) {
    const { user, created: wasCreated, reusedAlias } = await upsertSystemUser(def);
    const profiles = await upsertProfiles(user.id, def);

    if (wasCreated) created++;
    else updated++;
    if (reusedAlias) reusedAliases.push({ agent: def.displayName, alias: reusedAlias });

    agents.push(serializeSystemAgent(def, user, profiles));
  }

  return {
    created,
    updated,
    reusedAliases,
    agents,
  };
}

export async function listSystemAgents() {
  const agents = [];

  for (const def of SYSTEM_AGENT_DEFINITIONS) {
    const { user } = await findExistingUser(def);
    if (!user) {
      agents.push(serializeSystemAgent(def, null));
      continue;
    }
    const profiles = await readProfiles(user.id);
    agents.push(serializeSystemAgent(def, user, profiles as any));
  }

  return agents;
}

export async function setSystemAgentEnabled(agentId: string, enabled: boolean) {
  const identity = await storage.getAgentIdentity(agentId);
  const strategyProfile = jsonObject(identity?.strategyProfile);

  if (!identity || strategyProfile.systemAgent !== true) {
    return null;
  }

  const updated = await storage.upsertAgentIdentity(agentId, {
    strategyProfile: {
      ...strategyProfile,
      enabled,
    },
  });

  const def = SYSTEM_AGENT_DEFINITIONS.find((candidate) => candidate.key === strategyProfile.key);
  const user = await storage.getUser(agentId);
  const profiles = {
    ...(await readProfiles(agentId)),
    identity: updated,
  };

  return def ? serializeSystemAgent(def, user || null, profiles as any) : { identity: updated };
}

export const systemAgentDefinitions = SYSTEM_AGENT_DEFINITIONS;
