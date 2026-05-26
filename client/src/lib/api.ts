import { queryClient } from "./queryClient";
import type {
  CouncilGovernanceOverview,
  CouncilPackageContractsResponse,
  CouncilResponse,
  CouncilSampleLedgerResponse,
  CouncilStatusTaxonomyResponse,
} from "@shared/models/council-governance";

const API_BASE = "/api";
let csrfToken: string | null = null;

export type AdminVerifyResponse = {
  valid: boolean;
  role: "super_admin" | AdminStaffRole | null;
  permissions: string[];
  actor: {
    id: string;
    type: "root_admin" | "staff";
  } | null;
};

export type AdminLoginResponse = AdminVerifyResponse & { success: boolean };

export type AdminStaff = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: AdminStaffRole;
  permissions: string[];
  active: boolean;
  // T298 — Optional Slack handle (`@username` or Slack user ID) that powers
  // the "Slack <name>" deep-link button on the shared-preview banner.
  slackHandle: string | null;
  lastLoginAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  disabledAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminAccessType = "main_admin" | "staff_admin";
export type AdminStaffRole = "admin" | "staff" | "support" | "moderator" | "content" | "finance" | "ai_operator";

export type AdminStaffCreatePayload = {
  email: string;
  username: string;
  displayName: string;
  password: string;
  role: AdminStaffRole;
  permissions: string[];
  active?: boolean;
  // T298 — Optional Slack handle. Empty string clears it on update.
  slackHandle?: string;
};

export type AdminStaffUpdatePayload = Partial<Omit<AdminStaffCreatePayload, "password">> & {
  password?: string;
};

export type AdminAccessRequestPayload = {
  fullName: string;
  email: string;
  username: string;
  requestedAccessType: AdminAccessType;
  requestedRole: AdminStaffRole;
  reason: string;
  password: string;
  confirmPassword: string;
};

export type AdminAccessRequestResponse = {
  success: boolean;
  message: string;
  request: {
    id: string;
    status: string;
    email: string;
    username: string;
    requestedAccessType: AdminAccessType;
    requestedRole: AdminStaffRole;
    tokenExpiresAt: string;
  };
};

export type AdminSystemAgent = {
  key: string;
  expectedUsername: string;
  aliases: string[];
  seeded: boolean;
  user: {
    id: string;
    username: string;
    email: string;
    displayName: string;
    avatar: string | null;
    role: string;
    agentType: string | null;
    bio: string | null;
    capabilities: string[];
    industryTags: string[];
    badge: string | null;
    reputation: number;
    energy: number;
    creditWallet: number | null;
    verificationWeight: number | null;
  } | null;
  identity: any | null;
  genome: any | null;
  learningProfile: any | null;
  trustProfile: any | null;
  blueprint: {
    type: "chief" | "specialist" | "news_reader";
    role: string;
    goals: string[];
    permissions: Record<string, boolean>;
    personality: Record<string, number>;
    dna: Record<string, string | number>;
    scores: Record<string, number>;
    enabled: boolean | null;
  };
};

export type AdminSystemAgentSeedResult = {
  created: number;
  updated: number;
  reusedAliases: { agent: string; alias: string }[];
  agents: AdminSystemAgent[];
};

export type GviComponentKey = "USD" | "EUR" | "GBP" | "CNY" | "gold" | "crude_oil";

export type AdminGviResult = {
  generatedAt: string;
  gviScore: number;
  formula: string;
  componentFormula: string;
  components: Array<{
    key: GviComponentKey;
    label: string;
    weight: number;
    unit: string;
    baselineValue: number;
    currentValue: number;
    componentIndex: number;
    weightedContribution: number;
    source: string;
    timestamp: string;
    stale: boolean;
    fallback: boolean;
  }>;
  weights: Record<GviComponentKey, number>;
  componentValues: Record<GviComponentKey, number>;
  componentIndexes: Record<GviComponentKey, number>;
  sourceMetadata: Record<GviComponentKey, {
    source: string;
    timestamp: string;
    stale: boolean;
    fallback: boolean;
  }>;
  fallbackUsed: boolean;
  stale: boolean;
  latestSnapshotId: string | null;
  latestSnapshotAt: string | null;
  safety: {
    gluonInternalContributionCreditOnly: true;
    gviInformationalIndexOnly: true;
    cashoutRedemptionDisabled: true;
    walletCreditPayoutPaymentAffected: false;
    publicApi: false;
    externalFetch: false;
    automaticWorker: false;
  };
  warnings: string[];
};

export type AdminGviSnapshotResponse = {
  snapshot: {
    id: string;
    componentValues: Record<string, unknown>;
    componentIndexes: Record<string, unknown>;
    weights: Record<string, unknown>;
    gviScore: number;
    sourceMetadata: Record<string, unknown>;
    fallbackUsed: boolean;
    stale: boolean;
    createdBy: string | null;
    createdAt: string | null;
  };
  result: AdminGviResult;
};

export type AdminGluonRedemptionEligibilityReview = {
  id: string;
  userId: string;
  agentId: string | null;
  validGluon: number;
  invalidGluon: number;
  pendingGluon: number;
  latestGviSnapshotId: string | null;
  informationalEstimate: number;
  platformConversionRate: number;
  eligibilityStatus: string;
  complianceChecklist: Record<string, any>;
  fraudSignals: Record<string, any>;
  sourceSummary: Record<string, any>;
  adminReviewStatus: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminGluonRedemptionEligibilityResponse = {
  reviews: AdminGluonRedemptionEligibilityReview[];
  candidates: Array<Record<string, any>>;
  warnings: string[];
  safeguards: Record<string, boolean>;
  moneySystemsAvoided: Record<string, boolean>;
};

export type AdminGluonRedemptionPreviewResponse = {
  review: AdminGluonRedemptionEligibilityReview;
  preview: Record<string, any>;
  warnings: string[];
  safeguards: Record<string, boolean>;
};

export type AdminGluonRedemptionReviewResponse = {
  review: AdminGluonRedemptionEligibilityReview;
  warnings: string[];
  safeguards: Record<string, boolean>;
  moneySystemsAvoided?: Record<string, boolean>;
};

export const adminAgentActionTypes = [
  "stay_idle",
  "research_topic",
  "post_message",
  "comment_on_post",
  "attach_claim",
  "attach_evidence",
  "join_debate",
  "challenge_claim",
  "summarize_debate",
  "generate_news_script",
  "collaborate_agent",
  "ask_user_approval",
  "request_admin_review",
] as const;

export type AdminAgentActionType = typeof adminAgentActionTypes[number];
export type AdminAgentMemoryScope = "none" | "public" | "behavioral" | "private";

export type AdminAgentBehaviorSimulationPayload = {
  agentId: string;
  actionType?: AdminAgentActionType;
  event?: {
    type?: string;
    topic?: string;
    targetId?: string;
    content?: string;
  };
  metrics?: {
    goalAlignment?: number;
    trustImpact?: number;
    userValue?: number;
    rewardPotential?: number;
    risk?: number;
    cost?: number;
  };
  costBudget?: number;
  memoryScope?: AdminAgentMemoryScope;
  allowPrivateMemory?: boolean;
  includeGraphContext?: boolean;
  graphQuery?: string;
  graphPurpose?: AdminAgentGraphAccessPurpose;
  graphAllowHypotheses?: boolean;
  graphExplicitBusinessPermission?: boolean;
  graphMinimumConfidence?: number;
  includeKnowledgePacketContext?: boolean;
  knowledgePacketQuery?: string;
  knowledgePacketAllowHypotheses?: boolean;
  knowledgePacketExplicitBusinessPermission?: boolean;
  knowledgePacketMinimumConfidence?: number;
  knowledgePacketLimit?: number;
};

export type AdminAgentGraphRequesterType = "system_agent" | "user_agent" | "root_admin";
export type AdminAgentGraphAccessPurpose =
  | "reasoning"
  | "debate_preparation"
  | "evidence_validation"
  | "synthesis"
  | "learning_signal"
  | "marketplace_review"
  | "media_script_review";
export type AdminAgentGraphKnowledgeStatus = "fact" | "hypothesis" | "pattern";

export type AdminAgentGraphAccessPayload = {
  requesterType: AdminAgentGraphRequesterType;
  requesterAgentId?: string;
  purpose: AdminAgentGraphAccessPurpose;
  query?: string;
  limit?: number;
  allowHypotheses?: boolean;
  explicitBusinessPermission?: boolean;
  minimumConfidence?: number;
};

export type AdminAgentGraphContextNode = {
  id: string;
  nodeType: string;
  label: string;
  safeSummary: string | null;
  confidence: number;
  verificationStatus: string;
  vaultType: string;
  sensitivity: string;
  knowledgeStatus: AdminAgentGraphKnowledgeStatus;
  provenanceSummary: string;
  sourceType: string;
};

export type AdminAgentGraphContextEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  confidence: number;
  verificationStatus: string;
  vaultType: string;
  sensitivity: string;
  knowledgeStatus: AdminAgentGraphKnowledgeStatus;
  provenanceSummary: string;
  sourceType: string;
};

export type AdminAgentGraphAccessResult = {
  generatedAt: string;
  requester: {
    type: AdminAgentGraphRequesterType;
    agentId: string | null;
    validated: boolean;
    role: string | null;
    systemAgent: boolean;
    userAgent: boolean;
    ues: {
      available: boolean;
      score: number | null;
      sourceQuality: string | null;
    };
  };
  policy: {
    requesterType: AdminAgentGraphRequesterType;
    purpose: AdminAgentGraphAccessPurpose;
    allowedVaults: string[];
    allowedSensitivity: string[];
    minimumConfidence: number;
    hypothesesAllowed: boolean;
    businessPermissionRequired: boolean;
    explicitBusinessPermission: boolean;
    publicProjectionUsed: false;
    mutationAllowed: false;
  };
  context: {
    nodes: AdminAgentGraphContextNode[];
    edges: AdminAgentGraphContextEdge[];
  };
  blockedCounts: {
    total: number;
    byReason: Record<string, number>;
  };
  explanations: string[];
  deterministicChecks: Record<string, {
    passed: boolean;
    expected: string;
    actual: string;
    explanation: string;
  }>;
  safeguards: {
    internalOnly: true;
    rootAdminTestOnly: true;
    noPublicApi: true;
    noPublicProjectionFilter: true;
    noRawPrivateMemory: true;
    noRawBusinessRestrictedMemory: true;
    noGraphMutation: true;
    noAutonomousLearning: true;
  };
};

export type AdminAgentBehaviorSimulationResult = {
  agent: {
    id: string;
    username: string;
    displayName: string;
    role: string | null;
    enabled: boolean;
  };
  proposedAction: {
    type: AdminAgentActionType;
    label: string;
    description: string;
    executionMode: "log_only" | "simulate_only" | "blocked_in_mvp";
    publicWrite: boolean;
  };
  scoring: {
    formula: string;
    threshold: number;
    inputs: Record<string, number>;
    score: number;
  };
  policyChecks: Array<{
    key: string;
    label: string;
    passed: boolean;
    detail: string;
  }>;
  decision: {
    status: "approved" | "blocked" | "request_admin_review";
    reason: string;
    executable: boolean;
    executionMode: "log_only" | "simulate_only" | "blocked_in_mvp";
  };
  context: {
    identityLoaded: boolean;
    genomeLoaded: boolean;
    learningProfileLoaded: boolean;
    trustProfileLoaded: boolean;
    memoryScope: AdminAgentMemoryScope;
    memoryAccessAllowed: boolean;
    memoriesRetrieved: number;
    privateMemoryRequested: boolean;
    memoryDeniedCount: number;
    policyExplanations: string[];
    sanitizerRedactions: string[];
  };
  outcomeLog: {
    id: string | null;
    actionType: string;
  };
  graphContext: {
    enabled: boolean;
    nodesRetrieved: number;
    edgesRetrieved: number;
    blockedCounts: AdminAgentGraphAccessResult["blockedCounts"];
    policy: AdminAgentGraphAccessResult["policy"] | null;
    explanations: string[];
    deterministicChecks: AdminAgentGraphAccessResult["deterministicChecks"] | null;
  };
  knowledgePacketContext: {
    enabled: boolean;
    knowledgePacketsConsidered: number;
    knowledgePacketsUsed: number;
    packetRankingReasons: string[];
    blockedPacketCounts: {
      total: number;
      byReason: Record<string, number>;
    };
    policy: {
      requesterType: "system_agent" | "user_agent" | "root_admin";
      requesterAgentId: string;
      allowedVaults: string[];
      allowedSensitivity: string[];
      hypothesesAllowed: boolean;
      explicitBusinessPermission: boolean;
      minimumConfidence: number;
      mutationAllowed: false;
      gluonAwardAllowed: false;
    } | null;
    packets: Array<{
      id: string;
      title: string;
      safeSummary: string;
      sourceType: string;
      domainTags: string[];
      industryTags: string[];
      vaultType: string;
      sensitivity: string;
      privacyLevel: string;
      verificationStatus: string;
      reviewStatus: string;
      status: string;
      knowledgeStatus: "fact" | "hypothesis" | "pattern";
      confidence: number;
      provenanceSummary: string;
      rankingScore: number;
      rankingReasons: string[];
      weightedAcceptance: number;
      gluonSignal: {
        amount: number;
        normalized: number;
        nonConvertible: true;
        rankingOnly: true;
      };
      creatorTrust: {
        available: boolean;
        ues: number | null;
        sourceQuality: string | null;
      };
      freshness: number;
      consentSummary: {
        creatorConsent: boolean;
        crossAgentLearningConsent: boolean;
        businessKnowledgeApproved: boolean;
      };
    }>;
    simulatedGluonSignals: Array<{
      packetId: string;
      title: string;
      amount: number;
      normalized: number;
      weightedAcceptance: number;
      nonConvertible: true;
      rankingOnly: true;
    }>;
    hypothesisItems: Array<{
      packetId: string;
      title: string;
      reason: string;
    }>;
    blockedItems: {
      total: number;
      byReason: Record<string, number>;
    };
    explanations: string[];
    deterministicChecks: Record<string, {
      passed: boolean;
      expected: string;
      actual: string;
      explanation: string;
    }> | null;
  };
  dnaContext: {
    enabled: boolean;
    primeColorSignature: Record<string, any>;
    knowledgeDomains: string[];
    behaviorStyle: Record<string, number | string>;
    trustEconomicGenome: Record<string, number | string | boolean>;
    dnaMetadata: Record<string, any>;
    mutationHistorySummary: {
      totalRecent: number;
      preview: number;
      applied: number;
      rejected: number;
      latestPreviewAt: string | null;
    };
    mutationPreviewOnly: true;
    liveGenomeMutated: false;
    oldEvolutionServiceTriggered: false;
    explanations: string[];
  };
  reasoningTraceSummary: {
    graphContextUsed: boolean;
    knowledgePacketContextUsed: boolean;
    dnaContextUsed: boolean;
    reasoningInputsUsed: string[];
    safetyGatesApplied: string[];
    noMutationConfirmation: {
      graphMutation: false;
      packetMutation: false;
      dnaMutationApply: false;
      gluonAward: false;
      walletOrPayout: false;
      autonomousExecution: false;
      publicPublishing: false;
    };
  };
  blockedUnsafeActionCheck: {
    passed: boolean;
    actionType: AdminAgentActionType;
    expected: string;
    actual: string;
    reason: string;
  };
  privateMemoryBlockCheck: {
    passed: boolean;
    vaultType: "personal";
    sensitivity: "private";
    context: "public_debate";
    expected: string;
    actual: string;
    reason: string;
  };
};

export type AdminNewsToDebateArticle = {
  id: number;
  title: string;
  sourceUrl: string;
  sourceName: string;
  sourceType: string;
  summary: string | null;
  originalContent: string | null;
  category: string;
  status: string;
  impactScore: number | null;
  debateId: number | null;
  publishedAt: string | null;
  createdAt: string | null;
};

export type AdminNewsToDebatePayload = {
  articleId?: number;
  manualArticle?: {
    title: string;
    sourceUrl: string;
    sourceName?: string;
    content: string;
    publishedAt?: string;
  };
};

export type AdminNewsToDebateResult = {
  mode: "admin_review_draft";
  safety: {
    manualTriggerOnly: boolean;
    autonomousPublishing: boolean;
    publicPublishing: boolean;
    youtubeUpload: boolean;
    podcastAudio: boolean;
    privateMemoryUsed: boolean;
  };
  article: {
    id: number;
    title: string;
    sourceUrl: string;
    sourceName: string;
    status: string;
    reusedExisting: boolean;
    duplicateMatchedBy: string;
    linkedToDraftDebate: boolean;
  };
  sourceReliability: {
    score: number;
    quality: "low" | "medium" | "high";
    factors: string[];
    conservativeDefaultUsed: boolean;
  };
  debate: {
    id: number;
    title: string;
    topic: string;
    status: string;
    format: string;
    consensusSummary: string | null;
    disagreementSummary: string | null;
    confidenceScore: number | null;
  };
  selectedAgents: Array<{
    agentId: string;
    key: string;
    displayName: string;
    role: string;
    position: string;
    ues: number | null;
  }>;
  transcript: Array<{
    id: number;
    roundNumber: number;
    turnOrder: number;
    content: string;
    audienceReaction?: {
      draft?: boolean;
      stance?: string;
      generatedBy?: string;
    } | null;
  }>;
  claims: Array<{
    id: string;
    statement: string;
    evidenceUrl: string | null;
    status: string;
    confidenceScore: number;
  }>;
  synthesis: {
    conclusion: string;
    openRisks: string[];
  };
  generatedAt: string;
};

export type AdminPodcastScriptDebate = {
  id: number;
  title: string;
  topic: string;
  status: string;
  format: string;
  consensusSummary: string | null;
  sourceReliability: number | null;
  createdAt: string | null;
  sourceArticle: {
    id: number;
    title: string;
    sourceName: string;
    sourceUrl: string;
  } | null;
};

export type AdminPodcastScriptPackagePayload = {
  twoMinuteNewsScript: string;
  tenMinutePodcastScript: string;
  youtubeTitle: string;
  youtubeDescription: string;
  shortsHooks: string[];
  thumbnailText: string;
  speakerAssignments: Array<{
    agentKey: string;
    displayName: string;
    role: string;
    assignment: string;
  }>;
  complianceSafetyNotes: string[];
  sourceEvidenceReferences: Array<{
    label: string;
    url: string | null;
    claimId?: string;
    confidenceScore?: number;
    status?: string;
  }>;
  adminReviewStatus: string;
};

export type AdminPodcastScriptSafetyNotes = {
  manualTriggerOnly: boolean;
  internalDraftOnly: boolean;
  audioGenerated: boolean;
  ttsGenerated: boolean;
  youtubeUpload: boolean;
  podcastHostingUpload: boolean;
  socialPosting: boolean;
  publicPublishing: boolean;
  privateMemoryUsed: boolean;
  sourceReliability: number | null;
  weakOrDisputedClaims: Array<{
    claimId: string;
    statement: string;
    status: string;
    confidenceScore: number;
    reason: string;
  }>;
  notes: string[];
};

export type AdminPodcastScriptPackage = {
  id: number;
  debateId: number;
  sourceArticleId: number | null;
  status: string;
  scriptPackage: AdminPodcastScriptPackagePayload;
  safetyNotes: AdminPodcastScriptSafetyNotes;
  generatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminPodcastScriptGenerateResult = {
  mode: "admin_review_script_package";
  safety: AdminPodcastScriptSafetyNotes;
  package: AdminPodcastScriptPackage;
  debate: AdminPodcastScriptDebate;
  packagePreview: AdminPodcastScriptPackagePayload;
  sourceReferences: AdminPodcastScriptPackagePayload["sourceEvidenceReferences"];
  generatedAt: string;
};

export type AdminPodcastAudioVoiceProfile = {
  agentKey: string;
  displayName: string;
  role: string;
  provider: string;
  voiceId: string;
  voiceLabel: string;
  assignment: string;
};

export type AdminPodcastAudioJobSegment = {
  segmentIndex: number;
  scriptType: "two_minute" | "ten_minute" | "mougle_conclusion";
  agentKey: string;
  displayName: string;
  role: string;
  provider: string;
  voiceId: string;
  voiceLabel: string;
  status: "pending" | "completed" | "mock" | "failed";
  textPreview: string;
  characterCount: number;
  audioPath: string | null;
  audioUrl: string | null;
  mimeType: string | null;
  estimatedCost: number;
  actualCost: number;
  errorMessage: string | null;
  generatedAt: string | null;
};

export type AdminPodcastAudioJob = {
  id: number;
  scriptPackageId: number;
  status: string;
  provider: string;
  voiceProfileMapping: Record<string, AdminPodcastAudioVoiceProfile>;
  segments: AdminPodcastAudioJobSegment[];
  estimatedCost: number;
  actualCost: number;
  errorMessage: string | null;
  adminReviewStatus: string;
  generatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminVoiceJobsProviderStatus = {
  selected: "elevenlabs" | "replit_openai_audio" | "mock";
  elevenLabsConfigured: boolean;
  replitOpenAiAudioConfigured: boolean;
  mockAvailable: true;
  message: string;
};

export type AdminVoiceJobsPackage = AdminPodcastScriptPackage & {
  latestVoiceJob: AdminPodcastAudioJob | null;
};

export type AdminVoiceJobsPackagesResponse = {
  providerStatus: AdminVoiceJobsProviderStatus;
  packages: AdminVoiceJobsPackage[];
};

export type AdminVoiceJobGeneratePayload = {
  scriptPackageId: number;
  scriptType: "two_minute" | "ten_minute" | "both";
  provider: "auto" | "elevenlabs" | "replit_openai_audio" | "mock";
};

export type AdminVoiceJobGenerateResult = {
  mode: "internal_admin_review_voice_job";
  providerStatus: AdminVoiceJobsProviderStatus;
  job: AdminPodcastAudioJob;
  scriptPackage: AdminPodcastScriptPackage;
  generatedAt: string;
  safety: {
    manualTriggerOnly: boolean;
    internalReviewOnly: boolean;
    publicPublishing: boolean;
    youtubeUpload: boolean;
    podcastHostingUpload: boolean;
    socialPosting: boolean;
    avatarVideoRendering: boolean;
    privateMemoryUsed: boolean;
  };
};

export type AdminYouTubeChecklistItem = {
  key: string;
  label: string;
  passed: boolean;
  severity: "info" | "warning" | "blocking";
  message: string;
};

export type AdminYouTubePackageMetadata = {
  title: string;
  description: string;
  tags: string[];
  thumbnailText: string;
  shortsHooks: string[];
  privacyStatus: "private";
  scriptPackageStatus: string;
  scriptAdminReviewStatus: string;
  audioJobStatus: string | null;
  videoAsset: {
    generatedClipId: number | null;
    title: string | null;
    pathPresent: boolean;
    format: string | null;
    durationSeconds: number | null;
  };
  manualApprovalRequired: boolean;
  internalReviewOnly: boolean;
};

export type AdminYouTubePublishingPackage = {
  id: number;
  scriptPackageId: number;
  audioJobId: number | null;
  generatedClipId: number | null;
  status: string;
  approvalStatus: string;
  uploadStatus: string;
  provider: "dry_run" | "youtube_data_api";
  packageMetadata: AdminYouTubePackageMetadata;
  readinessChecklist: AdminYouTubeChecklistItem[];
  complianceChecklist: AdminYouTubeChecklistItem[];
  sourceChecklist: AdminYouTubeChecklistItem[];
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  youtubeStatus: string | null;
  errorMessage: string | null;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  uploadedBy: string | null;
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminYouTubeProviderStatus = {
  selected: "dry_run" | "youtube_data_api";
  youtubeConfigured: boolean;
  channelConfigured: boolean;
  dryRunAvailable: true;
  message: string;
};

export type AdminYouTubeVideoAsset = {
  id: number;
  title: string;
  status: string;
  uploadStatus: string | null;
  durationSeconds: number | null;
  format: string;
  hasVideoPath: boolean;
  youtubeUrl: string | null;
};

export type AdminYouTubeEligibleItem = {
  scriptPackage: AdminPodcastScriptPackage;
  latestAudioJob: AdminPodcastAudioJob | null;
  videoAssets: AdminYouTubeVideoAsset[];
  existingPackage: AdminYouTubePublishingPackage | null;
};

export type AdminYouTubeEligibleResponse = {
  providerStatus: AdminYouTubeProviderStatus;
  items: AdminYouTubeEligibleItem[];
};

export type AdminYouTubeCreatePackagePayload = {
  scriptPackageId: number;
  audioJobId?: number | null;
  generatedClipId?: number | null;
};

export type AdminYouTubePackageActionResult = {
  providerStatus: AdminYouTubeProviderStatus;
  package: AdminYouTubePublishingPackage;
  scriptPackage?: AdminPodcastScriptPackage;
  audioJob?: AdminPodcastAudioJob | null;
  videoAsset?: AdminYouTubeVideoAsset | null;
  uploadResult?: {
    videoId: string;
    url: string;
    status: string;
    provider: "youtube_data_api";
  };
};

export type AdminAvatarVideoProvider = "dry_run" | "heygen" | "d_id" | "synthesia" | "unreal";
export type AdminAvatarVideoSceneTemplate = "news_desk" | "podcast_studio" | "debate_arena_summary" | "minimal_cards";

export type AdminAvatarVideoProviderStatus = {
  selected: AdminAvatarVideoProvider;
  dryRunDefault: true;
  liveProviderCalls: false;
  configured: boolean;
  placeholderOnly: boolean;
  message: string;
};

export type AdminAvatarVideoProfile = {
  agentKey: string;
  displayName: string;
  role: string;
  renderRole: "presenter_host" | "conclusion_presence" | "speaker_card";
  avatarStyle: string;
  source: "script_assignment" | "voice_profile" | "required_system_mapping";
};

export type AdminAvatarVideoSegmentMapping = {
  segmentIndex: number;
  scriptType: "two_minute" | "ten_minute" | "mougle_conclusion";
  agentKey: string;
  displayName: string;
  role: string;
  textPreview: string;
  audioAvailable: boolean;
  audioUrl: string | null;
  audioPath: string | null;
  status: string;
};

export type AdminAvatarVideoPreviewMetadata = {
  title: string;
  thumbnailText: string;
  descriptionPreview: string;
  shortsHooks: string[];
  complianceNotes: string[];
  sourceEvidenceReferences: AdminPodcastScriptPackagePayload["sourceEvidenceReferences"];
  providerStatus: {
    selected: AdminAvatarVideoProvider;
    dryRunDefault: true;
    liveProviderCalls: false;
    message: string;
  };
  safety: {
    internalAdminReviewOnly: boolean;
    manualRootAdminTriggerOnly: boolean;
    publicPublishing: boolean;
    youtubeUpload: boolean;
    socialPosting: boolean;
    privateMemoryUsed: boolean;
    userOwnedAvatarsIncluded: boolean;
    unreal3dImplementation: boolean;
  };
  safeModeWarnings: string[];
  excludedSpeakers: Array<{
    agentKey: string;
    displayName: string;
    reason: string;
  }>;
  generatedAt: string;
};

export type AdminAvatarVideoRenderJob = {
  id: number;
  scriptPackageId: number;
  audioJobId: number | null;
  youtubePackageId: number | null;
  status: string;
  provider: AdminAvatarVideoProvider;
  sceneTemplate: AdminAvatarVideoSceneTemplate;
  avatarProfileMapping: Record<string, AdminAvatarVideoProfile>;
  segmentMapping: AdminAvatarVideoSegmentMapping[];
  previewMetadata: AdminAvatarVideoPreviewMetadata;
  estimatedCost: number;
  actualCost: number;
  adminReviewStatus: string;
  outputPath: string | null;
  outputUrl: string | null;
  errorMessage: string | null;
  createdBy: string;
  previewedAt: string | null;
  renderedBy: string | null;
  renderedAt: string | null;
  canceledBy: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminAvatarVideoEligibleItem = {
  scriptPackage: AdminPodcastScriptPackage;
  latestAudioJob: AdminPodcastAudioJob | null;
  youtubePackage: AdminYouTubePublishingPackage | null;
  existingRenderJob: AdminAvatarVideoRenderJob | null;
};

export type AdminAvatarVideoEligibleResponse = {
  providerStatus: AdminAvatarVideoProviderStatus;
  safeModeWarnings: string[];
  sceneTemplates: AdminAvatarVideoSceneTemplate[];
  providers: AdminAvatarVideoProvider[];
  items: AdminAvatarVideoEligibleItem[];
};

export type AdminAvatarVideoCreatePayload = {
  scriptPackageId: number;
  audioJobId?: number | null;
  youtubePackageId?: number | null;
  provider?: AdminAvatarVideoProvider;
  sceneTemplate?: AdminAvatarVideoSceneTemplate;
};

export type AdminAvatarVideoActionResult = {
  providerStatus: AdminAvatarVideoProviderStatus;
  job: AdminAvatarVideoRenderJob;
  scriptPackage?: AdminPodcastScriptPackage;
  audioJob?: AdminPodcastAudioJob | null;
  youtubePackage?: AdminYouTubePublishingPackage | null;
};

export type AdminSocialDistributionProviderStatus = {
  platform: string;
  configured: boolean;
  provider: "export_only" | "platform_api";
  enabledForAutomation: boolean;
  message: string;
};

export type AdminSocialDistributionCopyItem = {
  platform: string;
  text: string;
  hashtags: string[];
  linkUrl: string | null;
  exportUrl: string | null;
  characterCount: number;
  dryRunOnly: boolean;
};

export type AdminSocialDistributionCopyPackage = {
  sourceTitle: string;
  sourceSummary: string;
  sourceUrl: string | null;
  sourceType: string;
  mode: "manual" | "safe_automation";
  posts: AdminSocialDistributionCopyItem[];
  evidenceReferences: Array<{
    label: string;
    url: string | null;
    claimId?: string;
    confidenceScore?: number;
    status?: string;
  }>;
  complianceNotes: string[];
  safetyLabels: string[];
  generatedAt: string;
};

export type AdminSocialDistributionGate = {
  key: string;
  label: string;
  passed: boolean;
  severity: "info" | "warning" | "blocking";
  message: string;
};

export type AdminSocialDistributionPlatformResult = {
  platform: string;
  provider: "export_only" | "platform_api";
  status: "pending" | "export_ready" | "posted" | "blocked" | "failed";
  dryRun: boolean;
  postUrl: string | null;
  message: string;
  postedAt: string | null;
};

export type AdminSocialDistributionPackage = {
  id: number;
  youtubePackageId: number | null;
  scriptPackageId: number | null;
  audioJobId: number | null;
  sourceArticleId: number | null;
  sourceType: string;
  targetPlatforms: string[];
  mode: "manual" | "safe_automation";
  status: string;
  approvalStatus: string;
  postingStatus: string;
  exportStatus: string;
  generatedCopy: AdminSocialDistributionCopyPackage;
  safetyGateResults: AdminSocialDistributionGate[];
  platformResults: AdminSocialDistributionPlatformResult[];
  errorMessage: string | null;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  postedBy: string | null;
  postedAt: string | null;
  exportedBy: string | null;
  exportedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSocialDistributionAutomationSettings = {
  id: number;
  safeAutomationEnabled: boolean;
  paused: boolean;
  killSwitch: boolean;
  perPlatformEnabled: Record<string, { enabled: boolean; dailyLimit?: number }>;
  dailyPostLimit: number;
  duplicateWindowHours: number;
  trustThreshold: number;
  uesThreshold: number;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSocialDistributionEligibleItem = {
  youtubePackage: AdminYouTubePublishingPackage;
  scriptPackage: AdminPodcastScriptPackage;
  latestAudioJob: AdminPodcastAudioJob | null;
  existingDistributionPackage: AdminSocialDistributionPackage | null;
};

export type AdminSocialDistributionEligibleResponse = {
  providerStatus: AdminSocialDistributionProviderStatus[];
  items: AdminSocialDistributionEligibleItem[];
};

export type AdminSocialDistributionGeneratePayload = {
  youtubePackageId: number;
  targetPlatforms?: string[];
  mode?: "manual" | "safe_automation";
};

export type AdminSocialDistributionSettingsResponse = {
  settings: AdminSocialDistributionAutomationSettings;
  providerStatus: AdminSocialDistributionProviderStatus[];
};

export type AdminSocialDistributionAutomationResult = {
  status: "blocked" | "prepared" | "exported";
  message: string;
  settings: AdminSocialDistributionAutomationSettings;
  package: AdminSocialDistributionPackage | null;
  gates: AdminSocialDistributionGate[];
};

export type UesSourceQuality = "calculated" | "partial" | "fallback";

export type UesMetric = {
  key: string;
  label: string;
  value: number;
  sourceQuality: UesSourceQuality;
  dataPoints: number;
  explanation: string;
};

export type UesComponent = {
  score: number;
  sourceQuality: UesSourceQuality;
  formula: string;
  inputs: Record<string, UesMetric>;
};

export type UnifiedEvolutionScore = {
  agent: {
    id: string;
    username: string;
    displayName: string;
    role: string | null;
    systemAgent: boolean;
    enabled: boolean;
  };
  scores: {
    P: number;
    D: number;
    Omega: number;
    Xi: number;
    UES: number;
    costEfficiency: number;
    correctionCapacity: number;
  };
  components: {
    P: UesComponent;
    D: UesComponent;
    Omega: UesComponent;
    Xi: UesComponent;
    costEfficiency: UesMetric;
    correctionCapacity: UesMetric;
  };
  truthFirst: {
    truthSeeking: number;
    rewardSeeking: number;
    rewardPenaltyApplied: boolean;
    explanation: string;
  };
  collapseRisk: {
    score: number;
    level: "low" | "medium" | "high" | "critical";
    readOnly: true;
    reasons: string[];
  };
  sourceQuality: {
    calculated: number;
    partial: number;
    fallback: number;
    total: number;
    overall: UesSourceQuality;
  };
  dataSources: Record<string, number>;
  explanations: string[];
  generatedAt: string;
};

export type GlobalUnifiedEvolutionScore = {
  agentCount: number;
  averageUES: number;
  averageP: number;
  averageD: number;
  averageOmega: number;
  averageXi: number;
  averageCostEfficiency: number;
  averageCorrectionCapacity: number;
  sourceQuality: UnifiedEvolutionScore["sourceQuality"];
  collapseRisk: Record<UnifiedEvolutionScore["collapseRisk"]["level"], number>;
  agents: UnifiedEvolutionScore[];
  topAgents: Array<{
    agentId: string;
    displayName: string;
    UES: number;
    collapseRisk: UnifiedEvolutionScore["collapseRisk"]["level"];
  }>;
  atRiskAgents: Array<{
    agentId: string;
    displayName: string;
    UES: number;
    collapseRisk: UnifiedEvolutionScore["collapseRisk"]["level"];
    reasons: string[];
  }>;
  generatedAt: string;
};

export type CivilizationHealth = {
  score: number;
  truthStability: number;
  independentReasoning: number;
  constructiveResonance: number;
  governanceIntegrity: number;
  correctionCapacity: number;
  costDiscipline: number;
  collapseRisk: {
    level: UnifiedEvolutionScore["collapseRisk"]["level"];
    distribution: GlobalUnifiedEvolutionScore["collapseRisk"];
    readOnly: true;
  };
  sourceQuality: UnifiedEvolutionScore["sourceQuality"];
  explanation: string;
  generatedAt: string;
};

export type AdminCivilizationHealthStatus = "healthy" | "watch" | "risk" | "critical";
export type AdminCivilizationHealthLevel = "low" | "medium" | "high" | "critical";
export type AdminCivilizationHealthRecommendation =
  | "monitor"
  | "founder review recommended"
  | "pause autonomous publishing recommended"
  | "pause marketplace approvals recommended"
  | "pause external agents recommended";

export type AdminCivilizationHealthMetric = {
  key: string;
  label: string;
  value: number;
  displayValue: string;
  unit?: string;
  sourceQuality: UesSourceQuality;
  dataPoints: number;
  status: AdminCivilizationHealthStatus;
  explanation: string;
};

export type AdminCivilizationHealthSection = {
  key: string;
  title: string;
  summary: string;
  status: AdminCivilizationHealthStatus;
  sourceQuality: UesSourceQuality;
  metrics: AdminCivilizationHealthMetric[];
  details?: Record<string, unknown>;
};

export type AdminCivilizationHealthDashboard = {
  generatedAt: string;
  readOnly: true;
  summary: {
    score: number;
    displayScore: string;
    collapseRiskLevel: AdminCivilizationHealthLevel;
    founderReviewNeeded: boolean;
    safeModeRecommendationStatus: AdminCivilizationHealthRecommendation[];
    explanation: string;
  };
  ues: {
    averageUES: number;
    averageP: number;
    averageD: number;
    averageOmega: number;
    averageXi: number;
    correctionCapacity: number;
    sourceQuality: UnifiedEvolutionScore["sourceQuality"];
  };
  sections: AdminCivilizationHealthSection[];
  collapseRisk: {
    score: number;
    level: AdminCivilizationHealthLevel;
    sourceQuality: UesSourceQuality;
    signals: Array<{
      key: string;
      label: string;
      value: number;
      status: AdminCivilizationHealthStatus;
      weight: number;
      explanation: string;
    }>;
    phase12Distribution: Record<AdminCivilizationHealthLevel, number>;
    readOnly: true;
  };
  recommendations: Array<{
    key: string;
    label: AdminCivilizationHealthRecommendation;
    reason: string;
    readOnly: true;
  }>;
  dataQuality: {
    calculated: number;
    partial: number;
    fallback: number;
    total: number;
    overall: UesSourceQuality;
  };
  safeguards: {
    rootAdminOnly: true;
    readOnly: true;
    noPrivateMemoryContent: true;
    noAutomaticSafeMode: true;
    noPublishingChanges: true;
    noMarketplaceActions: true;
  };
};

export type AdminLiveStudioDisplayStatus = "draft" | "scheduled" | "live" | "paused" | "ended" | "archived";

export type AdminLiveStudioDebateSummary = {
  id: number;
  title: string;
  topic: string;
  status: string;
  displayStatus: AdminLiveStudioDisplayStatus;
  format: string;
  currentRound: number;
  totalRounds: number;
  participantCount: number;
  activeParticipantCount: number;
  transcriptTurnCount: number;
  tcsAverage: number | null;
  confidenceScore: number | null;
  createdAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
};

export type AdminLiveStudioParticipant = {
  id: number;
  userId: string;
  displayName: string;
  username: string | null;
  avatar: string | null;
  userRole: string | null;
  badge: string | null;
  rankLevel: string | null;
  role: string;
  participantType: string;
  position: string | null;
  ttsVoice: string | null;
  speakingOrder: number;
  totalSpeakingTime: number;
  turnsUsed: number;
  isActive: boolean;
  joinedAt: string | null;
  ues: {
    UES: number;
    P: number;
    D: number;
    Omega: number;
    Xi: number;
    collapseRisk: string;
    sourceQuality: string;
  } | null;
};

export type AdminLiveStudioState = {
  generatedAt: string;
  adminOnly: true;
  controlsRootAdminOnly: true;
  noAutonomousExecution: true;
  debate: {
    id: number;
    title: string;
    topic: string;
    description: string | null;
    status: string;
    displayStatus: AdminLiveStudioDisplayStatus;
    format: string;
    currentRound: number;
    totalRounds: number;
    currentSpeakerId: string | null;
    turnDurationSeconds: number;
    confidenceScore: number | null;
    createdAt: string | null;
    startedAt: string | null;
    endedAt: string | null;
  };
  stage: {
    currentSpeaker: AdminLiveStudioParticipant | null;
    nextSpeaker: AdminLiveStudioParticipant | null;
    timer: {
      simulatedOnly: true;
      turnDurationSeconds: number;
      elapsedSeconds: number;
      remainingSeconds: number;
      running: boolean;
      source: string;
    };
    statusLabels: AdminLiveStudioDisplayStatus[];
  };
  participants: AdminLiveStudioParticipant[];
  transcript: Array<{
    id: number;
    debateId: number;
    participantId: number;
    participantName: string;
    participantType: string | null;
    roundNumber: number;
    turnOrder: number;
    content: string;
    wordCount: number;
    durationSeconds: number | null;
    tcsScore: number | null;
    audienceReaction: Record<string, any>;
    startedAt: string | null;
    endedAt: string | null;
    createdAt: string | null;
  }>;
  evidence: {
    claims: any[];
    evidence: any[];
    consensus: any[];
    legacyClaims: any[];
    legacyEvidence: any[];
    linkedDataOnly: true;
  };
  metrics: {
    tcsAverage: number | null;
    uesAverage: number | null;
    participantUesCount: number;
    claimsCount: number;
    evidenceCount: number;
    transcriptTurnCount: number;
  };
  mougleSummary: {
    consensusSummary: string | null;
    disagreementSummary: string | null;
    confidenceScore: number | null;
  };
  safeMode: {
    globalSafeMode: boolean;
    pauseExternalAgentActions: boolean;
    banners: string[];
  };
  adminQuestionQueue: {
    placeholderOnly: true;
    persistentStorageDeferred: true;
    items: any[];
  };
  safeguards: {
    noPublicMutationRoutes: true;
    noAutonomousLiveStream: true;
    noAutonomousAgentExecution: true;
    noPrivateMemoryExposure: true;
    displayOnlyTimer: true;
  };
};

export type AdminLiveStudioQuestionResult = {
  accepted: boolean;
  placeholderOnly: true;
  persisted: false;
  message: string;
  state: AdminLiveStudioState;
};

export type AdminDigitalWorldOverview = {
  generatedAt: string;
  rootAdminOnly: true;
  readOnly: true;
  adminVisualizationOnly: true;
  noSimulationEngine: true;
  noMutations: true;
  model: {
    name: "selective_digital_world_ui";
    phase: string;
    description: string;
  };
  safeMode: {
    flags: {
      globalSafeMode: boolean;
      pauseAutonomousPublishing: boolean;
      pauseMarketplaceApprovals: boolean;
      pauseExternalAgentActions: boolean;
      pauseSocialDistributionAutomation: boolean;
      pauseYouTubeUploads: boolean;
      pausePodcastAudioGeneration: boolean;
    };
    activePauseCount: number;
    globalSafeMode: boolean;
    summary: string;
  };
  civilization: {
    score: number;
    displayScore: string;
    collapseRiskLevel: string;
    founderReviewNeeded: boolean;
    recommendations: string[];
  };
  zones: Array<{
    id: string;
    title: string;
    subtitle: string;
    status: "healthy" | "watch" | "paused" | "risk" | "unknown";
    healthLabel: string;
    riskLabel: string;
    recentActivitySummary: string;
    counts: Array<{
      key: string;
      label: string;
      value: number | string;
      tone: "success" | "info" | "warning" | "danger" | "muted";
    }>;
    safetyFlags: Array<{
      key: string;
      label: string;
      active: boolean;
      severity: "info" | "warning" | "blocking";
      description: string;
    }>;
    links: Array<{
      label: string;
      href: string;
      kind: "primary" | "secondary";
    }>;
  }>;
  safeguards: {
    aggregateCountsOnly: true;
    noRawPackagePayloads: true;
    noPrivateMemoryExposure: true;
    noBusinessRestrictedMemoryExposure: true;
    noSecretsOrTokens: true;
    noPublicRoute: true;
    noAutonomousExecution: true;
    noMarketplaceTransactions: true;
    noMoneyOrRedemptionChanges: true;
  };
};

export type AdminKnowledgeGraphNode = {
  nodeKey: string;
  nodeType: string;
  label: string;
  summary: string | null;
  sourceTable: string;
  sourceId: string;
  confidence: number;
  verificationStatus: string;
  vaultType: string;
  sensitivity: string;
  visibility: string;
  provenance: Record<string, any>;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

export type AdminKnowledgeGraphEdge = {
  edgeKey: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  relationType: string;
  confidence: number;
  verificationStatus: string;
  vaultType: string;
  sensitivity: string;
  visibility: string;
  provenance: Record<string, any>;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

export type AdminKnowledgeGraphSummary = {
  generatedAt: string;
  internalOnly: true;
  manualSyncOnly: true;
  totals: {
    nodes: number;
    edges: number;
    blockedRestrictedSources: number;
    orphanNodes: number;
    duplicateNodeKeys: number;
    duplicateEdgeKeys: number;
    highRiskUnverifiedClusters: number;
  };
  qualityMetrics: {
    nodeCount: number;
    edgeCount: number;
    orphanNodeCount: number;
    duplicateNodeKeyCount: number;
    duplicateEdgeKeyCount: number;
    confidenceDistribution: Record<string, number>;
    verificationDistribution: Record<string, number>;
    vaultDistribution: Record<string, number>;
    sensitivityDistribution: Record<string, number>;
    provenanceCoverage: number;
    evidenceCoverage: number;
    blockedPrivateRestrictedSourceCount: number;
    highRiskUnverifiedClusterCount: number;
    sourceTableDistribution: Record<string, number>;
    syncDurationMs: number | null;
    lastSyncStatus: "success" | "error" | "not_synced";
    lastSyncedAt: string | null;
  };
  qualityScores: {
    graphCompleteness: number;
    graphTrust: number;
    graphSafety: number;
    graphFreshness: number;
    overallGraphQuality: number;
  };
  deterministicChecks: {
    privateRestrictedMemoryBlocked: {
      passed: boolean;
      blockedCount: number;
      ingestedPrivateOrPersonalCount: number;
      explanation: string;
    };
    duplicateKeysChecked: {
      passed: boolean;
      duplicateNodeKeyCount: number;
      duplicateEdgeKeyCount: number;
      explanation: string;
    };
    unknownClassificationBlocked: {
      passed: boolean;
      unknownVaultOrSensitivityCount: number;
      explanation: string;
    };
  };
  nodeCountsByType: Record<string, number>;
  edgeCountsByRelation: Record<string, number>;
  verificationDistribution: Record<string, number>;
  vaultDistribution: Record<string, number>;
  sensitivityDistribution: Record<string, number>;
  topConnected: Array<{
    nodeKey: string;
    nodeType: string;
    label: string;
    connectionCount: number;
    verificationStatus: string;
  }>;
  highRiskClusters: Array<{
    nodeKey: string;
    nodeType: string;
    label: string;
    verificationStatus: string;
    confidence: number;
    reason: string;
  }>;
  blockedCounts: {
    total: number;
    bySource: Record<string, number>;
    byReason: Record<string, number>;
    samples: Array<{
      sourceTable: string;
      reason: string;
      vaultType: string;
      sensitivity: string;
    }>;
  };
  provenanceSummaries: Array<{
    sourceTable: string;
    nodes: number;
    edges: number;
  }>;
  qualitySignals: {
    uesAvailable: boolean;
    sourceQuality: UesSourceQuality;
    notes: string[];
  };
  safeguards: {
    rootAdminOnly: true;
    internalAdminInspectionOnly: true;
    noRawPrivateMemoryContent: true;
    noPublicGraphRoutes: boolean;
    publicSafeProjectionOnly: true;
    noAutonomousGraphExpansion: true;
  };
};

export type AdminKnowledgeGraphSyncResult = {
  syncedAt: string;
  recordsScanned: number;
  recordsScannedBySource: Record<string, number>;
  nodesPrepared: number;
  edgesPrepared: number;
  nodesUpserted: number;
  edgesUpserted: number;
  blockedRecords: number;
  skippedRecords: number;
  skippedCounts: {
    total: number;
    bySource: Record<string, number>;
    byReason: Record<string, number>;
    samples: Array<{
      sourceTable: string;
      sourceId: string;
      reason: string;
    }>;
  };
  warnings: string[];
  errors: string[];
  syncDurationMs: number;
  lastSyncStatus: "success";
  duplicateNodeKeyCount: number;
  duplicateEdgeKeyCount: number;
  blockedCounts: AdminKnowledgeGraphSummary["blockedCounts"];
  summary: AdminKnowledgeGraphSummary;
};

export type PublicKnowledgeGraphNode = {
  id: string;
  type: string;
  label: string;
  summary: string | null;
  confidence: number;
  verificationStatus: string;
  vaultType: "public" | "verified";
  sensitivity: "public" | "low";
  sourceSummary: string;
  provenanceSummary: string;
};

export type PublicKnowledgeGraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  confidence: number;
  verificationStatus: string;
  sourceSummary: string;
  provenanceSummary: string;
};

export type PublicKnowledgeGraphPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  beta: true;
  noindexRecommended: true;
};

export type PublicKnowledgeGraphSummary = {
  generatedAt: string;
  beta: true;
  noindexRecommended: true;
  publicOnly: true;
  readOnly: true;
  totals: {
    nodes: number;
    edges: number;
    topics: number;
    entities: number;
    relationships: number;
  };
  verificationDistribution: Record<string, number>;
  confidenceDistribution: Record<string, number>;
  sourceSummaries: Array<{
    sourceType: string;
    nodes: number;
    edges: number;
  }>;
  leakPreventionChecks: {
    personalPrivateExcluded: {
      passed: boolean;
      checkedRows: number;
      excludedRows: number;
      explanation: string;
    };
    businessRestrictedExcluded: {
      passed: boolean;
      checkedRows: number;
      excludedRows: number;
      explanation: string;
    };
    unknownClassificationExcluded: {
      passed: boolean;
      checkedRows: number;
      excludedRows: number;
      explanation: string;
    };
    rawInternalsOmitted: {
      passed: boolean;
      checkedRows: number;
      excludedRows: number;
      explanation: string;
    };
  };
  safeguards: {
    serverSideFiltering: true;
    noPublicSync: true;
    noMutationRoutes: true;
    noRawPrivateMemory: true;
    noRawSourceIds: true;
    noAdminQualityMetrics: true;
  };
  message: string;
};

export type AdminSafeModeControls = {
  id: number;
  globalSafeMode: boolean;
  pauseAutonomousPublishing: boolean;
  pauseMarketplaceApprovals: boolean;
  pauseExternalAgentActions: boolean;
  pauseSocialDistributionAutomation: boolean;
  pauseYouTubeUploads: boolean;
  pausePodcastAudioGeneration: boolean;
  maintenanceBannerEnabled: boolean;
  maintenanceBannerMessage: string | null;
  updatedBy: string | null;
  lastReason: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminSafeModeCapability =
  | "youtube_upload"
  | "social_safe_automation"
  | "marketplace_clone_approval"
  | "podcast_audio_generation"
  | "external_agent_action"
  | "agent_behavior_simulation";

export type AdminSafeModeControlField =
  | "globalSafeMode"
  | "pauseAutonomousPublishing"
  | "pauseMarketplaceApprovals"
  | "pauseExternalAgentActions"
  | "pauseSocialDistributionAutomation"
  | "pauseYouTubeUploads"
  | "pausePodcastAudioGeneration"
  | "maintenanceBannerEnabled";

export type AdminSafetyGate = {
  id: number;
  name: string;
  status: "PASS" | "FAIL";
  details: string;
};

export type AdminSafetyFixture = {
  fixture: string;
  adversarial: string;
  expectedGate: string;
  rejectedAt: string;
  outcome: string;
};

export type AdminSafetyReport = {
  ok: true;
  generatedAt: string | null;
  generatedAtIso: string | null;
  passing: number;
  total: number;
  allPassing: boolean;
  gates: AdminSafetyGate[];
  fixtures: AdminSafetyFixture[];
  raw: string;
  rawPath: string;
  fileModifiedAt: string;
};

export type AdminSafeModeStatus = {
  controls: AdminSafeModeControls;
  blockedCapabilities: Array<{
    capability: AdminSafeModeCapability;
    blocked: boolean;
    reasons: string[];
    controls: AdminSafeModeControlField[];
  }>;
  relatedControls: {
    automationPolicy: {
      id: number;
      mode: string;
      safeMode: boolean;
      killSwitch: boolean;
      updatedAt: string;
    } | null;
    founderEmergencyStopped: boolean;
    socialAutomationSettings: AdminSocialDistributionAutomationSettings | null;
  };
  safeguards: {
    rootAdminOnly: boolean;
    manualActionsOnly: boolean;
    globalSafeModeDoesNotBlockManualAdminWork: boolean;
    explicitPauseFlagsGateMatchingFlowsOnly: boolean;
    noAutonomousActivation: boolean;
    noSecretsExposed: boolean;
  };
  knownConflicts: Array<{
    key: string;
    description: string;
    status: string;
  }>;
};

export type AdminSafeModeUpdatePayload = Partial<Record<AdminSafeModeControlField, boolean>> & {
  maintenanceBannerMessage?: string | null;
  reason: string;
};

export type AdminSafeModeActionPayload = {
  action: AdminSafeModeControlField;
  enabled: boolean;
  maintenanceBannerMessage?: string | null;
  reason: string;
};

export type ExternalAgentCapability =
  | "read_public_context"
  | "submit_claim"
  | "attach_evidence"
  | "join_sandbox_debate"
  | "request_collaboration"
  | "sandbox_action_simulation"
  | "read_public_graph"
  | "read_public_passport";

export const externalAgentCapabilityOptions: ExternalAgentCapability[] = [
  "read_public_context",
  "submit_claim",
  "attach_evidence",
  "join_sandbox_debate",
  "request_collaboration",
  "sandbox_action_simulation",
  "read_public_graph",
  "read_public_passport",
];

export type AdminExternalAgentKey = {
  id: string;
  userId: string | null;
  agentId: string | null;
  label: string;
  tokenPrefix: string;
  capabilities: ExternalAgentCapability[];
  sandboxMode: boolean;
  active: boolean;
  revokedAt: string | null;
  revokedBy: string | null;
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
  lastUsedAt: string | null;
  lastUsedIpHash: string | null;
  lastUsedUserAgentHash: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  tokenHashStored: boolean;
  rawTokenAvailable: false;
};

export type AdminExternalAgentKeysResponse = {
  keys: AdminExternalAgentKey[];
  recentAudit: any[];
  safeguards: {
    hashedTokensOnly: boolean;
    rawTokenReturnedOnce: boolean;
    sandboxOnly: boolean;
    noPrivateMemoryAccess: boolean;
    genericBearerDoesNotSatisfyUserAuth: boolean;
  };
};

export type AdminExternalAgentKeyCreatePayload = {
  label: string;
  userId?: string | null;
  agentId?: string | null;
  capabilities?: ExternalAgentCapability[];
  sandboxMode?: boolean;
  active?: boolean;
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
};

export type AdminExternalAgentKeyCreateResponse = {
  key: AdminExternalAgentKey;
  rawToken: string;
  tokenShownOnce: true;
  warning: string;
};

async function fetchCsrfToken(): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/csrf-token`, { credentials: "include" });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (data?.csrfToken) {
    csrfToken = data.csrfToken;
    return csrfToken;
  }
  return null;
}

async function ensureCsrfToken(method?: string) {
  const verb = (method || "GET").toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return;
  if (!csrfToken) {
    await fetchCsrfToken();
  }
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  await ensureCsrfToken(options?.method);
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message);
  }
  return res.json();
}

async function adminFetch<T>(url: string, options?: RequestInit): Promise<T> {
  await ensureCsrfToken(options?.method);
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message);
  }
  return res.json();
}

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export const api = {
  auth: {
    signup: (data: any) => fetchJSON<any>("/auth/signup", { method: "POST", body: JSON.stringify(data) }),
    signin: (data: any) => fetchJSON<any>("/auth/signin", { method: "POST", body: JSON.stringify(data) }),
    fetchCsrfToken: () => fetchCsrfToken(),
    verifyEmail: (userId: string, code: string) => 
      fetchJSON<any>("/auth/verify-email", { method: "POST", body: JSON.stringify({ userId, code }) }),
    resendCode: (userId: string) => 
      fetchJSON<any>("/auth/resend-code", { method: "POST", body: JSON.stringify({ userId }) }),
    completeProfile: (data: any) => 
      fetchJSON<any>("/auth/complete-profile", { method: "POST", body: JSON.stringify(data) }),
    forgotPassword: (email: string) =>
      fetchJSON<any>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
    resetPassword: (token: string, newPassword: string) =>
      fetchJSON<any>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) }),
  },
  onboarding: {
    state: () => fetchJSON<{ state: string; interest: string | null }>("/onboarding/state"),
    setInterest: (interest: string) =>
      fetchJSON<any>("/onboarding/interest", { method: "POST", body: JSON.stringify({ interest }) }),
    complete: () => fetchJSON<any>("/onboarding/complete", { method: "POST" }),
  },
  topics: {
    list: () => fetchJSON<any[]>("/topics"),
  },
  posts: {
    list: (topicSlug?: string) => fetchJSON<any[]>(`/posts${topicSlug ? `?topic=${topicSlug}` : ""}`),
    listPaginated: (params: { topic?: string; sort?: string; page?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params.topic) qs.set("topic", params.topic);
      if (params.sort) qs.set("sort", params.sort);
      qs.set("page", String(params.page || 1));
      qs.set("limit", String(params.limit || 15));
      return fetchJSON<{ posts: any[]; total: number; page: number; limit: number }>(`/posts?${qs.toString()}`);
    },
    get: (id: string) => fetchJSON<any>(`/posts/${id}`),
    create: (data: any) => fetchJSON<any>("/posts", { method: "POST", body: JSON.stringify(data) }),
    like: (postId: string, userId: string) => 
      fetchJSON<any>(`/posts/${postId}/like`, { method: "POST", body: JSON.stringify({ userId }) }),
  },
  comments: {
    list: (postId: string) => fetchJSON<any[]>(`/posts/${postId}/comments`),
    create: (postId: string, data: any) => 
      fetchJSON<any>(`/posts/${postId}/comments`, { method: "POST", body: JSON.stringify(data) }),
  },
  users: {
    list: () => fetchJSON<any[]>("/users"),
    get: (id: string) => fetchJSON<any>(`/users/${id}`),
  },
  ranking: {
    list: () => fetchJSON<any[]>("/ranking"),
  },
  trustScore: {
    get: (postId: string) => fetchJSON<any>(`/trust-score/${postId}`),
  },
  agentVerify: {
    submit: (data: any) => fetchJSON<any>("/agent/verify", { method: "POST", body: JSON.stringify(data) }),
  },
  agentOrchestrator: {
    status: () => fetchJSON<any>("/agent-orchestrator/status"),
    activity: (limit = 50) => fetchJSON<any[]>(`/agent-orchestrator/activity?limit=${limit}`),
    trigger: () => fetchJSON<any>("/agent-orchestrator/trigger", { method: "POST" }),
  },
  economy: {
    wallet: (userId: string) => fetchJSON<any>(`/economy/wallet/${userId}`),
    transactions: (userId: string, limit = 50) => fetchJSON<any[]>(`/economy/transactions/${userId}?limit=${limit}`),
    metrics: () => fetchJSON<any>("/economy/metrics"),
    spend: (data: any) => fetchJSON<any>("/economy/spend", { method: "POST", body: JSON.stringify(data) }),
    transfer: (data: any) => fetchJSON<any>("/economy/transfer", { method: "POST", body: JSON.stringify(data) }),
  },
  agentLearning: {
    metrics: () => fetchJSON<any[]>("/agent-learning/metrics"),
    agentMetrics: (agentId: string) => fetchJSON<any>(`/agent-learning/metrics/${agentId}`),
    status: () => fetchJSON<any>("/agent-learning/status"),
    trigger: () => fetchJSON<any>("/agent-learning/trigger", { method: "POST" }),
  },
  societies: {
    list: () => fetchJSON<any[]>("/societies"),
    get: (id: string) => fetchJSON<any>(`/societies/${id}`),
    tasks: (id: string) => fetchJSON<any[]>(`/societies/${id}/tasks`),
    messages: (id: string, limit = 50) => fetchJSON<any[]>(`/societies/${id}/messages?limit=${limit}`),
  },
  collaboration: {
    metrics: () => fetchJSON<any>("/collaboration/metrics"),
    trigger: () => fetchJSON<any>("/collaboration/trigger", { method: "POST" }),
  },
  agentChat: {
    send: (data: any) => fetchJSON<any>("/agent/internal-chat", { method: "POST", body: JSON.stringify(data) }),
  },
  governance: {
    proposals: (status?: string) => fetchJSON<any[]>(`/governance/proposals${status ? `?status=${status}` : ""}`),
    proposal: (id: string) => fetchJSON<any>(`/governance/proposals/${id}`),
    createProposal: (data: any) => fetchJSON<any>("/governance/proposals", { method: "POST", body: JSON.stringify(data) }),
    vote: (proposalId: string, data: any) => fetchJSON<any>(`/governance/proposals/${proposalId}/vote`, { method: "POST", body: JSON.stringify(data) }),
    metrics: () => fetchJSON<any>("/governance/metrics"),
    trigger: () => fetchJSON<any>("/governance/trigger", { method: "POST" }),
  },
  alliances: {
    list: () => fetchJSON<any[]>("/alliances"),
  },
  institutions: {
    list: () => fetchJSON<any[]>("/institutions"),
    rules: () => fetchJSON<any[]>("/institution-rules"),
  },
  taskContracts: {
    list: (status?: string) => fetchJSON<any[]>(`/task-contracts${status ? `?status=${status}` : ""}`),
    create: (data: any) => fetchJSON<any>("/task-contracts", { method: "POST", body: JSON.stringify(data) }),
    bid: (contractId: string, data: any) => fetchJSON<any>(`/task-contracts/${contractId}/bid`, { method: "POST", body: JSON.stringify(data) }),
    selectBid: (contractId: string) => fetchJSON<any>(`/task-contracts/${contractId}/select-bid`, { method: "POST" }),
  },
  civilizations: {
    list: () => fetchJSON<any[]>("/civilizations"),
    get: (id: string) => fetchJSON<any>(`/civilizations/${id}`),
    metrics: () => fetchJSON<any>("/civilizations/metrics"),
    invest: (civId: string, data: any) => fetchJSON<any>(`/civilizations/${civId}/invest`, { method: "POST", body: JSON.stringify(data) }),
    trigger: () => fetchJSON<any>("/civilizations/trigger", { method: "POST" }),
  },
  agentIdentity: {
    get: (agentId: string) => fetchJSON<any>(`/agents/${agentId}/identity`),
    memory: (agentId: string, limit = 50, type?: string) =>
      fetchJSON<any[]>(`/agents/${agentId}/memory?limit=${limit}${type ? `&type=${type}` : ""}`),
  },
  ethics: {
    metrics: () => fetchJSON<any>("/ethics/metrics"),
    trigger: () => fetchJSON<any>("/ethics/trigger", { method: "POST" }),
    profile: (entityId: string) => fetchJSON<any>(`/ethics/profile/${entityId}`),
    rules: (status?: string) => fetchJSON<any[]>(`/ethics/rules${status ? `?status=${status}` : ""}`),
    events: (limit = 50) => fetchJSON<any[]>(`/ethics/events?limit=${limit}`),
  },
  evolution: {
    metrics: () => fetchJSON<any>("/evolution/metrics"),
    ues: (agentId: string) => fetchJSON<UnifiedEvolutionScore>(`/evolution/ues/${agentId}`),
    globalScore: () => fetchJSON<GlobalUnifiedEvolutionScore>("/evolution/global-score"),
    civilizationHealth: () => fetchJSON<CivilizationHealth>("/evolution/civilization-health"),
    trigger: () => fetchJSON<any>("/evolution/trigger", { method: "POST" }),
    genome: (agentId: string) => fetchJSON<any>(`/evolution/genome/${agentId}`),
    lineage: (agentId: string) => fetchJSON<any>(`/evolution/lineage/${agentId}`),
    culturalMemory: (limit = 20, domain?: string) =>
      fetchJSON<any[]>(`/evolution/cultural-memory?limit=${limit}${domain ? `&domain=${domain}` : ""}`),
  },
  collective: {
    metrics: () => fetchJSON<any>("/collective/metrics"),
    goalField: () => fetchJSON<any>("/collective/goal-field"),
    insights: (status?: string) => fetchJSON<any[]>(`/collective/insights${status ? `?status=${status}` : ""}`),
    memory: () => fetchJSON<any>("/collective/memory"),
    trigger: () => fetchJSON<any>("/collective/trigger", { method: "POST" }),
  },
  publicKnowledgeGraph: {
    summary: () => fetchJSON<PublicKnowledgeGraphSummary>("/public/knowledge-graph/summary"),
    nodes: (params?: { nodeType?: string; limit?: number; offset?: number }) => {
      const search = new URLSearchParams();
      if (params?.nodeType) search.set("nodeType", params.nodeType);
      if (params?.limit) search.set("limit", String(params.limit));
      if (params?.offset) search.set("offset", String(params.offset));
      return fetchJSON<PublicKnowledgeGraphPage<PublicKnowledgeGraphNode>>(`/public/knowledge-graph/nodes${search.toString() ? `?${search}` : ""}`);
    },
    edges: (params?: { relationType?: string; limit?: number; offset?: number }) => {
      const search = new URLSearchParams();
      if (params?.relationType) search.set("relationType", params.relationType);
      if (params?.limit) search.set("limit", String(params.limit));
      if (params?.offset) search.set("offset", String(params.offset));
      return fetchJSON<PublicKnowledgeGraphPage<PublicKnowledgeGraphEdge>>(`/public/knowledge-graph/edges${search.toString() ? `?${search}` : ""}`);
    },
  },
  debates: {
    list: (status?: string) => fetchJSON<any[]>(`/debates${status ? `?status=${status}` : ""}`),
    get: (id: number) => fetchJSON<any>(`/debates/${id}`),
    create: (data: any) => fetchJSON<any>("/debates", { method: "POST", body: JSON.stringify(data) }),
    join: (id: number, userId: string, participantType: string, position?: string) =>
      fetchJSON<any>(`/debates/${id}/join`, { method: "POST", body: JSON.stringify({ userId, participantType, position }) }),
    autoPopulate: (id: number, count?: number) =>
      fetchJSON<any>(`/debates/${id}/auto-populate`, { method: "POST", body: JSON.stringify({ count: count || 3 }) }),
    start: (id: number) => fetchJSON<any>(`/debates/${id}/start`, { method: "POST" }),
    submitTurn: (id: number, userId: string, content: string) =>
      fetchJSON<any>(`/debates/${id}/turn`, { method: "POST", body: JSON.stringify({ userId, content }) }),
    end: (id: number) => fetchJSON<any>(`/debates/${id}/end`, { method: "POST" }),
    quickRun: (id: number, agentCount?: number, rounds?: number) =>
      fetchJSON<any>(`/debates/${id}/quick-run`, { method: "POST", body: JSON.stringify({ agentCount: agentCount || 3, rounds }) }),
    studioSetup: (id: number, youtubeStreamKey?: string) =>
      fetchJSON<any>(`/debates/${id}/studio/setup`, { method: "POST", body: JSON.stringify({ youtubeStreamKey }) }),
    studioOverrideSpeaker: (id: number, speakerId: string | null) =>
      fetchJSON<any>(`/debates/${id}/studio/override-speaker`, { method: "POST", body: JSON.stringify({ speakerId }) }),
    studioSpeech: (id: number, userId: string, transcript: string) =>
      fetchJSON<any>(`/debates/${id}/studio/speech`, { method: "POST", body: JSON.stringify({ userId, transcript }) }),
    studioTTS: (id: number, text: string, voice?: string) =>
      fetchJSON<any>(`/debates/${id}/studio/tts`, { method: "POST", body: JSON.stringify({ text, voice }) }),
  },
  flywheel: {
    trigger: (debateId: number) => fetchJSON<any>(`/flywheel/trigger/${debateId}`, { method: "POST" }),
    jobs: () => fetchJSON<any[]>("/flywheel/jobs"),
    job: (id: number) => fetchJSON<any>(`/flywheel/jobs/${id}`),
    debateJob: (debateId: number) => fetchJSON<any>(`/flywheel/debate/${debateId}`),
    clip: (id: number) => fetchJSON<any>(`/flywheel/clips/${id}`),
    clipVideoUrl: (id: number) => `/api/flywheel/clips/${id}/video`,
  },
  admin: {
    login: (username: string, password: string) =>
      fetchJSON<AdminLoginResponse>("/admin/login", { method: "POST", body: JSON.stringify({ username, password }) }),
    requestAccess: (data: AdminAccessRequestPayload) =>
      fetchJSON<AdminAccessRequestResponse>("/admin/access-requests", { method: "POST", body: JSON.stringify(data) }),
    logout: () => adminFetch<any>("/admin/logout", { method: "POST" }),
    verify: () => adminFetch<AdminVerifyResponse>("/admin/verify"),
    stats: () => adminFetch<any>("/admin/stats"),
    safetyReport: () => adminFetch<AdminSafetyReport>("/admin/safety-report"),
    safetyReportRawUrl: "/api/admin/safety-report/raw",
    civilizationHealth: () => adminFetch<AdminCivilizationHealthDashboard>("/admin/civilization-health"),
    digitalWorldOverview: () => adminFetch<AdminDigitalWorldOverview>("/admin/digital-world/overview"),
    councilGovernanceOverview: () => adminFetch<CouncilGovernanceOverview>("/admin/council-governance/overview"),
    councilGovernanceNewsCouncil: () => adminFetch<CouncilResponse>("/admin/council-governance/news-council"),
    councilGovernanceDebateCouncil: () => adminFetch<CouncilResponse>("/admin/council-governance/debate-council"),
    councilGovernancePackageContracts: () =>
      adminFetch<CouncilPackageContractsResponse>("/admin/council-governance/package-contracts"),
    councilGovernanceSampleLedger: () => adminFetch<CouncilSampleLedgerResponse>("/admin/council-governance/sample-ledger"),
    councilGovernanceStatusTaxonomy: () =>
      adminFetch<CouncilStatusTaxonomyResponse>("/admin/council-governance/status-taxonomy"),
    knowledgeGraphSummary: () => adminFetch<AdminKnowledgeGraphSummary>("/admin/knowledge-graph/summary"),
    knowledgeGraphNodes: (params?: { nodeType?: string; verificationStatus?: string; limit?: number }) => {
      const search = new URLSearchParams();
      if (params?.nodeType) search.set("nodeType", params.nodeType);
      if (params?.verificationStatus) search.set("verificationStatus", params.verificationStatus);
      if (params?.limit) search.set("limit", String(params.limit));
      return adminFetch<AdminKnowledgeGraphNode[]>(`/admin/knowledge-graph/nodes${search.toString() ? `?${search}` : ""}`);
    },
    knowledgeGraphEdges: (params?: { relationType?: string; limit?: number }) => {
      const search = new URLSearchParams();
      if (params?.relationType) search.set("relationType", params.relationType);
      if (params?.limit) search.set("limit", String(params.limit));
      return adminFetch<AdminKnowledgeGraphEdge[]>(`/admin/knowledge-graph/edges${search.toString() ? `?${search}` : ""}`);
    },
    syncKnowledgeGraph: () => adminFetch<AdminKnowledgeGraphSyncResult>("/admin/knowledge-graph/sync", { method: "POST" }),
    safeMode: () => adminFetch<AdminSafeModeStatus>("/admin/safe-mode"),
    updateSafeMode: (data: AdminSafeModeUpdatePayload) =>
      adminFetch<AdminSafeModeStatus>("/admin/safe-mode", { method: "PATCH", body: JSON.stringify(data) }),
    safeModeAction: (data: AdminSafeModeActionPayload) =>
      adminFetch<AdminSafeModeStatus>("/admin/safe-mode/action", { method: "POST", body: JSON.stringify(data) }),
    externalAgentKeys: () => adminFetch<AdminExternalAgentKeysResponse>("/admin/external-agents/keys"),
    createExternalAgentKey: (data: AdminExternalAgentKeyCreatePayload) =>
      adminFetch<AdminExternalAgentKeyCreateResponse>("/admin/external-agents/keys", { method: "POST", body: JSON.stringify(data) }),
    updateExternalAgentKey: (id: string, data: Partial<AdminExternalAgentKeyCreatePayload>) =>
      adminFetch<AdminExternalAgentKey>(`/admin/external-agents/keys/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    revokeExternalAgentKey: (id: string, reason?: string) =>
      adminFetch<AdminExternalAgentKey>(`/admin/external-agents/keys/${id}/revoke`, { method: "POST", body: JSON.stringify({ reason }) }),
    externalAgentAudit: (limit?: number) => adminFetch<any[]>(`/admin/external-agents/audit?limit=${limit || 50}`),
    liveStudioDebates: (limit?: number) =>
      adminFetch<AdminLiveStudioDebateSummary[]>(`/admin/live-studio/debates?limit=${limit || 50}`),
    liveStudioState: (id: number) => adminFetch<AdminLiveStudioState>(`/admin/live-studio/debates/${id}`),
    pauseLiveStudioDebate: (id: number, reason?: string) =>
      adminFetch<AdminLiveStudioState>(`/admin/live-studio/debates/${id}/pause`, { method: "POST", body: JSON.stringify({ reason }) }),
    resumeLiveStudioDebate: (id: number, reason?: string) =>
      adminFetch<AdminLiveStudioState>(`/admin/live-studio/debates/${id}/resume`, { method: "POST", body: JSON.stringify({ reason }) }),
    endLiveStudioDebate: (id: number, reason?: string) =>
      adminFetch<AdminLiveStudioState>(`/admin/live-studio/debates/${id}/end`, { method: "POST", body: JSON.stringify({ reason }) }),
    addLiveStudioQuestion: (id: number, data: { question: string; authorLabel?: string; reason?: string }) =>
      adminFetch<AdminLiveStudioQuestionResult>(`/admin/live-studio/debates/${id}/questions`, { method: "POST", body: JSON.stringify(data) }),
    ejectLiveStudioParticipant: (id: number, participantId: number, reason?: string) =>
      adminFetch<AdminLiveStudioState>(`/admin/live-studio/debates/${id}/participants/${participantId}/eject`, { method: "POST", body: JSON.stringify({ reason }) }),
    users: () => adminFetch<any[]>("/admin/users"),
    deleteUser: (id: string) => adminFetch<any>(`/admin/users/${id}`, { method: "DELETE" }),
    updateUser: (id: string, data: any) => adminFetch<any>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    staff: () => adminFetch<AdminStaff[]>("/admin/staff"),
    createStaff: (data: AdminStaffCreatePayload) => adminFetch<AdminStaff>("/admin/staff", { method: "POST", body: JSON.stringify(data) }),
    updateStaff: (id: string, data: AdminStaffUpdatePayload) => adminFetch<AdminStaff>(`/admin/staff/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    disableStaff: (id: string) => adminFetch<AdminStaff>(`/admin/staff/${id}/disable`, { method: "POST" }),
    enableStaff: (id: string) => adminFetch<AdminStaff>(`/admin/staff/${id}/enable`, { method: "POST" }),
    systemAgents: () => adminFetch<AdminSystemAgent[]>("/admin/system-agents"),
    seedSystemAgents: () => adminFetch<AdminSystemAgentSeedResult>("/admin/system-agents/seed", { method: "POST" }),
    updateSystemAgent: (id: string, data: { enabled: boolean }) =>
      adminFetch<AdminSystemAgent>(`/admin/system-agents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    simulateAgentBehavior: (data: AdminAgentBehaviorSimulationPayload) =>
      adminFetch<AdminAgentBehaviorSimulationResult>("/admin/agent-behavior/simulate", { method: "POST", body: JSON.stringify(data) }),
    evaluateAgentGraphAccess: (data: AdminAgentGraphAccessPayload) =>
      adminFetch<AdminAgentGraphAccessResult>("/admin/agent-graph-access/evaluate", { method: "POST", body: JSON.stringify(data) }),
    knowledgeEconomyPackets: (status?: string) =>
      adminFetch<any[]>(`/admin/knowledge-economy/packets${status ? `?status=${status}` : ""}`),
    knowledgeEconomyPacket: (id: string) => adminFetch<any>(`/admin/knowledge-economy/packets/${id}`),
    acceptKnowledgePacket: (id: string, data: any = {}) =>
      adminFetch<any>(`/admin/knowledge-economy/packets/${id}/accept`, { method: "POST", body: JSON.stringify(data) }),
    rejectKnowledgePacket: (id: string, data: any = {}) =>
      adminFetch<any>(`/admin/knowledge-economy/packets/${id}/reject`, { method: "POST", body: JSON.stringify(data) }),
    challengeKnowledgePacket: (id: string, data: any = {}) =>
      adminFetch<any>(`/admin/knowledge-economy/packets/${id}/challenge`, { method: "POST", body: JSON.stringify(data) }),
    previewKnowledgePacketGluon: (id: string) =>
      adminFetch<any>(`/admin/knowledge-economy/packets/${id}/gluon-preview`, { method: "POST" }),
    previewKnowledgePacketDna: (id: string, agentId?: string) =>
      adminFetch<any>(`/admin/knowledge-economy/packets/${id}/dna-preview`, { method: "POST", body: JSON.stringify({ agentId }) }),
    knowledgeEconomyGvi: () => adminFetch<AdminGviResult>("/admin/knowledge-economy/gvi"),
    previewKnowledgeEconomyGvi: (componentValues?: Partial<Record<GviComponentKey, number>>) =>
      adminFetch<AdminGviResult>("/admin/knowledge-economy/gvi/preview", { method: "POST", body: JSON.stringify({ componentValues }) }),
    snapshotKnowledgeEconomyGvi: (componentValues?: Partial<Record<GviComponentKey, number>>) =>
      adminFetch<AdminGviSnapshotResponse>("/admin/knowledge-economy/gvi/snapshot", { method: "POST", body: JSON.stringify({ componentValues }) }),
    knowledgeEconomyRedemptionEligibility: () =>
      adminFetch<AdminGluonRedemptionEligibilityResponse>("/admin/knowledge-economy/redemption/eligibility"),
    knowledgeEconomyRedemptionEligibilityDetail: (id: string) =>
      adminFetch<AdminGluonRedemptionReviewResponse>(`/admin/knowledge-economy/redemption/eligibility/${id}`),
    previewKnowledgeEconomyRedemptionEligibility: (data: { userId: string; agentId?: string }) =>
      adminFetch<AdminGluonRedemptionPreviewResponse>("/admin/knowledge-economy/redemption/eligibility/preview", { method: "POST", body: JSON.stringify(data) }),
    markKnowledgeEconomyRedemptionReviewed: (id: string, reason?: string) =>
      adminFetch<AdminGluonRedemptionReviewResponse>(`/admin/knowledge-economy/redemption/eligibility/${id}/mark-reviewed`, { method: "POST", body: JSON.stringify({ reason }) }),
    rejectKnowledgeEconomyRedemption: (id: string, reason: string) =>
      adminFetch<AdminGluonRedemptionReviewResponse>(`/admin/knowledge-economy/redemption/eligibility/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    newsToDebateArticles: (limit?: number) =>
      adminFetch<AdminNewsToDebateArticle[]>(`/admin/news-to-debate/articles?limit=${limit || 25}`),
    generateNewsToDebate: (data: AdminNewsToDebatePayload) =>
      adminFetch<AdminNewsToDebateResult>("/admin/news-to-debate/generate", { method: "POST", body: JSON.stringify(data) }),
    podcastScriptDebates: (limit?: number) =>
      adminFetch<AdminPodcastScriptDebate[]>(`/admin/podcast-scripts/debates?limit=${limit || 25}`),
    podcastScriptPackages: (debateId?: number) =>
      adminFetch<AdminPodcastScriptPackage[]>(`/admin/podcast-scripts${debateId ? `?debateId=${debateId}` : ""}`),
    generatePodcastScriptPackage: (debateId: number) =>
      adminFetch<AdminPodcastScriptGenerateResult>("/admin/podcast-scripts/generate", { method: "POST", body: JSON.stringify({ debateId }) }),
    voiceJobPackages: (limit?: number) =>
      adminFetch<AdminVoiceJobsPackagesResponse>(`/admin/voice-jobs/packages?limit=${limit || 50}`),
    voiceJobs: (scriptPackageId?: number, limit?: number) =>
      adminFetch<AdminPodcastAudioJob[]>(`/admin/voice-jobs?limit=${limit || 50}${scriptPackageId ? `&scriptPackageId=${scriptPackageId}` : ""}`),
    voiceJob: (id: number) => adminFetch<AdminPodcastAudioJob>(`/admin/voice-jobs/${id}`),
    generateVoiceJob: (data: AdminVoiceJobGeneratePayload) =>
      adminFetch<AdminVoiceJobGenerateResult>("/admin/voice-jobs/generate", { method: "POST", body: JSON.stringify(data) }),
    youtubeEligible: () => adminFetch<AdminYouTubeEligibleResponse>("/admin/youtube-publishing/eligible"),
    youtubePackages: () => adminFetch<AdminYouTubePublishingPackage[]>("/admin/youtube-publishing/packages"),
    youtubePackage: (id: number) => adminFetch<AdminYouTubePublishingPackage>(`/admin/youtube-publishing/packages/${id}`),
    createYouTubePackage: (data: AdminYouTubeCreatePackagePayload) =>
      adminFetch<AdminYouTubePackageActionResult>("/admin/youtube-publishing/packages", { method: "POST", body: JSON.stringify(data) }),
    validateYouTubePackage: (id: number) =>
      adminFetch<AdminYouTubePackageActionResult>(`/admin/youtube-publishing/packages/${id}/validate`, { method: "POST" }),
    approveYouTubePackage: (id: number) =>
      adminFetch<AdminYouTubePackageActionResult>(`/admin/youtube-publishing/packages/${id}/approve`, { method: "POST" }),
    uploadYouTubePackage: (id: number) =>
      adminFetch<AdminYouTubePackageActionResult>(`/admin/youtube-publishing/packages/${id}/upload`, { method: "POST" }),
    videoRenderEligiblePackages: (limit?: number) =>
      adminFetch<AdminAvatarVideoEligibleResponse>(`/admin/video-render/eligible-packages?limit=${limit || 50}`),
    videoRenderJobs: (limit?: number) =>
      adminFetch<AdminAvatarVideoRenderJob[]>(`/admin/video-render/jobs?limit=${limit || 50}`),
    videoRenderJob: (id: number) =>
      adminFetch<AdminAvatarVideoRenderJob>(`/admin/video-render/jobs/${id}`),
    createVideoRenderJob: (data: AdminAvatarVideoCreatePayload) =>
      adminFetch<AdminAvatarVideoActionResult>("/admin/video-render/jobs", { method: "POST", body: JSON.stringify(data) }),
    previewVideoRenderJob: (id: number) =>
      adminFetch<AdminAvatarVideoActionResult>(`/admin/video-render/jobs/${id}/preview`, { method: "POST" }),
    renderVideoRenderJob: (id: number) =>
      adminFetch<AdminAvatarVideoActionResult>(`/admin/video-render/jobs/${id}/render`, { method: "POST" }),
    cancelVideoRenderJob: (id: number) =>
      adminFetch<AdminAvatarVideoActionResult>(`/admin/video-render/jobs/${id}/cancel`, { method: "POST" }),
    socialDistributionEligible: (limit?: number) =>
      adminFetch<AdminSocialDistributionEligibleResponse>(`/admin/social-distribution/eligible?limit=${limit || 50}`),
    socialDistributionPackages: (limit?: number) =>
      adminFetch<AdminSocialDistributionPackage[]>(`/admin/social-distribution/packages?limit=${limit || 50}`),
    socialDistributionPackage: (id: number) =>
      adminFetch<AdminSocialDistributionPackage>(`/admin/social-distribution/packages/${id}`),
    generateSocialDistributionPackage: (data: AdminSocialDistributionGeneratePayload) =>
      adminFetch<AdminSocialDistributionPackage>("/admin/social-distribution/packages/generate", { method: "POST", body: JSON.stringify(data) }),
    approveSocialDistributionPackage: (id: number) =>
      adminFetch<AdminSocialDistributionPackage>(`/admin/social-distribution/packages/${id}/approve`, { method: "POST" }),
    exportSocialDistributionPackage: (id: number) =>
      adminFetch<AdminSocialDistributionPackage>(`/admin/social-distribution/packages/${id}/export`, { method: "POST" }),
    postSocialDistributionPackage: (id: number) =>
      adminFetch<AdminSocialDistributionPackage>(`/admin/social-distribution/packages/${id}/post`, { method: "POST" }),
    socialDistributionAutomationSettings: () =>
      adminFetch<AdminSocialDistributionSettingsResponse>("/admin/social-distribution/automation-settings"),
    updateSocialDistributionAutomationSettings: (data: Partial<AdminSocialDistributionAutomationSettings>) =>
      adminFetch<AdminSocialDistributionSettingsResponse>("/admin/social-distribution/automation-settings", { method: "PATCH", body: JSON.stringify(data) }),
    runSocialDistributionAutomationEvaluation: () =>
      adminFetch<AdminSocialDistributionAutomationResult>("/admin/social-distribution/automation/evaluate", { method: "POST" }),
    posts: () => adminFetch<any[]>("/admin/posts"),
    deletePost: (id: string) => adminFetch<any>(`/admin/posts/${id}`, { method: "DELETE" }),
    topics: () => adminFetch<any[]>("/admin/topics"),
    createTopic: (data: any) => adminFetch<any>("/admin/topics", { method: "POST", body: JSON.stringify(data) }),
    deleteTopic: (id: string) => adminFetch<any>(`/admin/topics/${id}`, { method: "DELETE" }),
    debates: () => adminFetch<any[]>("/admin/debates"),
    deleteDebate: (id: number) => adminFetch<any>(`/admin/debates/${id}`, { method: "DELETE" }),
    triggerSystem: (system: string) => adminFetch<any>(`/admin/trigger/${system}`, { method: "POST" }),
    promotion: {
      scores: (limit?: number, status?: string) =>
        adminFetch<any[]>(`/admin/promotion/scores?limit=${limit || 50}${status ? `&status=${status}` : ""}`),
      score: (id: number) => adminFetch<any>(`/admin/promotion/scores/${id}`),
      reviewQueue: () => adminFetch<any[]>("/admin/promotion/review-queue"),
      evaluate: (data: { contentType: string; contentId: string }) =>
        adminFetch<any>("/admin/promotion/evaluate", { method: "POST", body: JSON.stringify(data) }),
      evaluateAll: () => adminFetch<any>("/admin/promotion/evaluate-all", { method: "POST" }),
      override: (id: number, decision: string) =>
        adminFetch<any>(`/admin/promotion/override/${id}`, { method: "POST", body: JSON.stringify({ decision }) }),
      process: () => adminFetch<any>("/admin/promotion/process", { method: "POST" }),
    },
    growth: {
      analytics: () => adminFetch<any>("/admin/growth/analytics"),
      performance: (limit?: number, platform?: string) =>
        adminFetch<any[]>(`/admin/growth/performance?limit=${limit || 50}${platform ? `&platform=${platform}` : ""}`),
      viral: (limit?: number) => adminFetch<any[]>(`/admin/growth/viral?limit=${limit || 10}`),
      patterns: (platform?: string) =>
        adminFetch<any[]>(`/admin/growth/patterns${platform ? `?platform=${platform}` : ""}`),
      learn: () => adminFetch<any>("/admin/growth/learn", { method: "POST" }),
      optimize: (platform: string) =>
        adminFetch<any>("/admin/growth/optimize", { method: "POST", body: JSON.stringify({ platform }) }),
    },
    moderation: {
      flaggedUsers: () => adminFetch<any[]>("/admin/moderation/flagged-users"),
      logs: (limit?: number) => adminFetch<any[]>(`/admin/moderation/logs?limit=${limit || 100}`),
      userLogs: (userId: string) => adminFetch<any[]>(`/admin/moderation/logs/${userId}`),
      shadowBan: (userId: string) => adminFetch<any>(`/admin/moderation/shadow-ban/${userId}`, { method: "POST" }),
      unban: (userId: string) => adminFetch<any>(`/admin/moderation/unban/${userId}`, { method: "POST" }),
      markSpammer: (userId: string) => adminFetch<any>(`/admin/moderation/mark-spammer/${userId}`, { method: "POST" }),
      userStatus: (userId: string) => adminFetch<any>(`/admin/moderation/user-status/${userId}`),
    },
    founderControl: {
      configs: () => adminFetch<any[]>("/admin/founder-control/configs"),
      status: () => adminFetch<any>("/admin/founder-control/status"),
      updateConfig: (key: string, value: number) =>
        adminFetch<any>(`/admin/founder-control/config/${key}`, { method: "PATCH", body: JSON.stringify({ value }) }),
      bulkUpdate: (updates: Array<{ key: string; value: number }>) =>
        adminFetch<any>("/admin/founder-control/bulk-update", { method: "POST", body: JSON.stringify({ updates }) }),
      emergencyStop: () => adminFetch<any>("/admin/founder-control/emergency-stop", { method: "POST" }),
      emergencyRelease: () => adminFetch<any>("/admin/founder-control/emergency-release", { method: "POST" }),
    },
    founderDebug: {
      snapshot: () => adminFetch<any>("/founder-debug/snapshot"),
      aiLogs: (params?: { since?: number; model?: string; limit?: number }) =>
        adminFetch<any[]>(`/founder-debug/ai-logs${params ? `?${new URLSearchParams(Object.entries(params).filter(([,v]) => v != null).map(([k,v]) => [k, String(v)])).toString()}` : ""}`),
      aiStats: () => adminFetch<any>("/founder-debug/ai-stats"),
      economics: () => adminFetch<any>("/founder-debug/economics"),
      journey: (params?: { userId?: string; event?: string; limit?: number }) =>
        adminFetch<any[]>(`/founder-debug/journey${params ? `?${new URLSearchParams(Object.entries(params).filter(([,v]) => v != null).map(([k,v]) => [k, String(v)])).toString()}` : ""}`),
      journeySummary: () => adminFetch<any>("/founder-debug/journey-summary"),
      config: () => adminFetch<any>("/founder-debug/config"),
      updateConfig: (updates: any) => adminFetch<any>("/founder-debug/config", { method: "PUT", body: JSON.stringify(updates) }),
      aiLimits: () => adminFetch<any>("/founder-debug/ai-limits"),
    },
    stabilityTriangle: {
      snapshot: () => adminFetch<any>("/stability-triangle/snapshot"),
    },
    panicButton: {
      status: () => adminFetch<any>("/panic-button/status"),
      modes: () => adminFetch<any[]>("/panic-button/modes"),
      setMode: (mode: string) => adminFetch<any>("/panic-button/set-mode", { method: "POST", body: JSON.stringify({ mode }) }),
      alerts: (params?: { limit?: number; all?: boolean }) =>
        adminFetch<any[]>(`/panic-button/alerts${params ? `?${new URLSearchParams(Object.entries(params).filter(([,v]) => v != null).map(([k,v]) => [k, String(v)])).toString()}` : ""}`),
      acknowledgeAlert: (id: string) => adminFetch<any>(`/panic-button/alerts/${id}/acknowledge`, { method: "POST" }),
      thresholds: () => adminFetch<any>("/panic-button/thresholds"),
      updateThresholds: (updates: any) => adminFetch<any>("/panic-button/thresholds", { method: "PUT", body: JSON.stringify(updates) }),
    },
    liveBroadcastAlert: {
      status: () => adminFetch<{ ok: boolean; status: any }>("/admin/broadcasts/live-alert/status"),
      runNow: () => adminFetch<any>("/admin/broadcasts/live-alert/run-now", { method: "POST" }),
    },
    agentCostAnalytics: () => adminFetch<any>("/admin/agent-cost-analytics"),
    aiGatewayMetrics: () => adminFetch<any>("/admin/ai-gateway/metrics"),
    aiGatewayResetMetrics: () => adminFetch<any>("/admin/ai-gateway/reset-metrics", { method: "POST" }),
    commandCenter: {
      health: () => adminFetch<any>("/admin/command-center/health"),
      alerts: (limit = 50) => adminFetch<any[]>(`/admin/command-center/alerts?limit=${limit}`),
      openAlerts: () => adminFetch<any[]>("/admin/command-center/open-alerts"),
      acknowledgeAlert: (id: number) => adminFetch<any>(`/admin/command-center/alerts/${id}/acknowledge`, { method: "POST" }),
      resolveAlert: (id: number) => adminFetch<any>(`/admin/command-center/alerts/${id}/resolve`, { method: "POST" }),
      decisions: (status?: string) => adminFetch<any[]>(`/admin/command-center/decisions${status ? `?status=${status}` : ""}`),
      approveDecision: (id: number) => adminFetch<any>(`/admin/command-center/decisions/${id}/approve`, { method: "POST" }),
      rejectDecision: (id: number) => adminFetch<any>(`/admin/command-center/decisions/${id}/reject`, { method: "POST" }),
      policy: () => adminFetch<any>("/admin/command-center/policy"),
      updatePolicy: (data: { mode?: string; safeMode?: boolean; killSwitch?: boolean }) =>
        adminFetch<any>("/admin/command-center/policy", { method: "PATCH", body: JSON.stringify(data) }),
      killSwitch: () => adminFetch<any>("/admin/command-center/kill-switch", { method: "POST" }),
      releaseKillSwitch: () => adminFetch<any>("/admin/command-center/kill-switch/release", { method: "POST" }),
      safeMode: (enabled: boolean) => adminFetch<any>("/admin/command-center/safe-mode", { method: "POST", body: JSON.stringify({ enabled }) }),
      metricHistory: (key: string, since?: string) => adminFetch<any[]>(`/admin/command-center/metrics/${key}${since ? `?since=${since}` : ""}`),
      scan: () => adminFetch<any>("/admin/command-center/scan", { method: "POST" }),
    },
  },
  news: {
    list: (page = 1, limit = 20, category?: string) => fetchJSON<any>(`/news?page=${page}&limit=${limit}${category ? `&category=${category}` : ""}`),
    latest: (limit = 5) => fetchJSON<any[]>(`/news/latest?limit=${limit}`),
    get: (id: number) => fetchJSON<any>(`/news/${id}`),
    getBySlug: (slug: string) => fetchJSON<any>(`/news/slug/${slug}`),
    breaking: () => fetchJSON<any[]>(`/news/breaking`),
    comments: (articleId: number) => fetchJSON<any[]>(`/news/${articleId}/comments`),
    postComment: (articleId: number, data: { authorId: string; content: string; parentId?: number; commentType?: string }) =>
      fetchJSON<any>(`/news/${articleId}/comments`, { method: "POST", body: JSON.stringify(data) }),
    toggleLike: (articleId: number, userId: string) =>
      fetchJSON<any>(`/news/${articleId}/like`, { method: "POST", body: JSON.stringify({ userId }) }),
    checkLiked: (articleId: number, userId: string) =>
      fetchJSON<any>(`/news/${articleId}/liked?userId=${userId}`),
    share: (articleId: number, userId: string, platform?: string) =>
      fetchJSON<any>(`/news/${articleId}/share`, { method: "POST", body: JSON.stringify({ userId, platform }) }),
    likeComment: (commentId: number) =>
      fetchJSON<any>(`/news/comments/${commentId}/like`, { method: "POST" }),
    trigger: () => adminFetch<any>("/news/trigger", { method: "POST" }),
  },
  social: {
    accounts: () => adminFetch<any[]>("/admin/social/accounts"),
    createAccount: (data: any) => adminFetch<any>("/admin/social/accounts", { method: "POST", body: JSON.stringify(data) }),
    updateAccount: (id: number, data: any) => adminFetch<any>(`/admin/social/accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteAccount: (id: number) => adminFetch<any>(`/admin/social/accounts/${id}`, { method: "DELETE" }),
    posts: (limit?: number, status?: string) => adminFetch<any[]>(`/admin/social/posts?limit=${limit || 50}${status ? `&status=${status}` : ""}`),
    createPost: (data: any) => adminFetch<any>("/admin/social/posts", { method: "POST", body: JSON.stringify(data) }),
    publishPost: (id: number) => adminFetch<any>(`/admin/social/posts/${id}/publish`, { method: "POST" }),
    generateCaption: (data: { contentType: string; contentId: string; platform?: string }) =>
      adminFetch<any>("/admin/social/generate-caption", { method: "POST", body: JSON.stringify(data) }),
    triggerPublish: () => adminFetch<any>("/admin/social/trigger-publish", { method: "POST" }),
  },
  billing: {
    plans: () => fetchJSON<any[]>("/billing/plans"),
    creditPackages: () => fetchJSON<any[]>("/billing/credit-packages"),
    creditCosts: () => fetchJSON<any>("/billing/credit-costs"),
    purchaseCredits: (userId: string, packageId: string) =>
      fetchJSON<any>("/billing/purchase-credits", { method: "POST", body: JSON.stringify({ userId, packageId }) }),
    useCredits: (userId: string, actionType: string, actionLabel?: string, referenceId?: string) =>
      fetchJSON<any>("/billing/use-credits", { method: "POST", body: JSON.stringify({ userId, actionType, actionLabel, referenceId }) }),
    canAfford: (userId: string, actionType: string) =>
      fetchJSON<any>(`/billing/can-afford/${userId}/${actionType}`),
    summary: (userId: string) => fetchJSON<any>(`/billing/summary/${userId}`),
    subscription: (userId: string) => fetchJSON<any>(`/billing/subscription/${userId}`),
    subscribe: (userId: string, planName: string, billingCycle?: string) =>
      fetchJSON<any>("/billing/subscribe", { method: "POST", body: JSON.stringify({ userId, planName, billingCycle: billingCycle || "monthly" }) }),
    cancelSubscription: (userId: string) =>
      fetchJSON<any>("/billing/cancel-subscription", { method: "POST", body: JSON.stringify({ userId }) }),
    invoices: (userId: string) => fetchJSON<any[]>(`/billing/invoices/${userId}`),
    usage: (userId: string) => fetchJSON<any>(`/billing/usage/${userId}`),
    founderAnalytics: () => adminFetch<any>("/admin/billing/analytics"),
    founderFlywheel: () => adminFetch<any>("/admin/billing/flywheel"),
    founderPhaseTransition: () => adminFetch<any>("/admin/billing/phase-transition"),
    transitionIndex: () => adminFetch<any>("/admin/transition-index"),
    transitionMetrics: () => adminFetch<any>("/admin/transition-metrics"),
  },
  seo: {
    stats: () => adminFetch<any>("/seo/stats"),
    knowledge: () => fetchJSON<any>("/seo/knowledge"),
    knowledgeFeed: () => fetchJSON<any>("/seo/knowledge-feed"),
    calculateAuthority: (topicSlug?: string) => adminFetch<any>("/admin/seo/calculate-authority", { method: "POST", body: JSON.stringify({ topicSlug }) }),
    calculateGravity: () => adminFetch<any>("/admin/seo/calculate-gravity", { method: "POST" }),
    calculateCivilization: () => adminFetch<any>("/admin/seo/calculate-civilization", { method: "POST" }),
    generatePostSEO: (postId: string) => adminFetch<any>("/admin/seo/generate-post-seo", { method: "POST", body: JSON.stringify({ postId }) }),
    generateDebateConsensus: (debateId: number) => adminFetch<any>("/admin/seo/generate-debate-consensus", { method: "POST", body: JSON.stringify({ debateId }) }),
    batchGenerate: (limit?: number) => adminFetch<any>("/admin/seo/batch-generate", { method: "POST", body: JSON.stringify({ limit: limit || 10 }) }),
  },
  gravity: {
    history: (limit?: number) => adminFetch<any[]>(`/admin/gravity/history?limit=${limit || 20}`),
    trends: () => adminFetch<any>("/admin/gravity/trends"),
    calculate: () => adminFetch<any>("/admin/seo/calculate-gravity", { method: "POST" }),
    generateInsights: () => adminFetch<any>("/admin/gravity/generate-insights", { method: "POST" }),
  },
  civilization: {
    history: (limit?: number) => adminFetch<any[]>(`/admin/civilization/history?limit=${limit || 20}`),
    trends: () => adminFetch<any>("/admin/civilization/trends"),
    calculate: () => adminFetch<any>("/admin/seo/calculate-civilization", { method: "POST" }),
    generateInsights: () => adminFetch<any>("/admin/civilization/generate-insights", { method: "POST" }),
  },
  userAgents: {
    list: (ownerId?: string) => fetchJSON<any[]>(`/user-agents${ownerId ? `?ownerId=${ownerId}` : ""}`),
    get: (id: string) => fetchJSON<any>(`/user-agents/${id}`),
    create: (data: any) => fetchJSON<any>("/user-agents", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchJSON<any>(`/user-agents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => fetchJSON<any>(`/user-agents/${id}`, { method: "DELETE" }),
    deploy: (id: string, modes: string[]) => fetchJSON<any>(`/user-agents/${id}/deploy`, { method: "POST", body: JSON.stringify({ modes }) }),
    knowledge: (id: string) => fetchJSON<any[]>(`/user-agents/${id}/knowledge`),
    addKnowledge: (id: string, data: any) => fetchJSON<any>(`/user-agents/${id}/knowledge`, { method: "POST", body: JSON.stringify(data) }),
    deleteKnowledge: (sourceId: string) => fetchJSON<any>(`/user-agents/knowledge/${sourceId}`, { method: "DELETE" }),
    use: (id: string, data: any) => fetchJSON<any>(`/user-agents/${id}/use`, { method: "POST", body: JSON.stringify(data) }),
    usage: (id: string, limit?: number) => fetchJSON<any[]>(`/user-agents/${id}/usage?limit=${limit || 50}`),
  },
  userAgentBuilder: {
    presets: () => fetchJSON<Record<string, any>>("/user-agent-builder/presets"),
    create: (data: any) => fetchJSON<any>("/user-agent-builder", { method: "POST", body: JSON.stringify(data) }),
    status: (id: string) => fetchJSON<any>(`/user-agent-builder/${id}/status`),
    simulate: (id: string) => fetchJSON<any>(`/user-agent-builder/${id}/simulate`, { method: "POST" }),
    test: (id: string, message: string) => fetchJSON<any>(`/user-agent-builder/${id}/test`, { method: "POST", body: JSON.stringify({ message }) }),
  },
  knowledgeEconomy: {
    eligibleAgents: () => fetchJSON<any[]>("/knowledge-economy/eligible-agents"),
    packets: () => fetchJSON<any[]>("/knowledge-economy/packets"),
    previewPacket: (data: any) => fetchJSON<any>("/knowledge-economy/packets/preview", { method: "POST", body: JSON.stringify(data) }),
    createPacket: (data: any) => fetchJSON<any>("/knowledge-economy/packets", { method: "POST", body: JSON.stringify(data) }),
    submitPacket: (id: string) => fetchJSON<any>(`/knowledge-economy/packets/${id}/submit`, { method: "POST" }),
  },
  marketplace: {
    listings: (category?: string) => fetchJSON<any[]>(`/marketplace/listings${category ? `?category=${category}` : ""}`),
    listing: (id: string) => fetchJSON<any>(`/marketplace/listings/${id}`),
    createListing: (data: any) => fetchJSON<any>("/marketplace/listings", { method: "POST", body: JSON.stringify(data) }),
    purchase: (buyerId: string, listingId: string) => fetchJSON<any>("/marketplace/purchase", { method: "POST", body: JSON.stringify({ buyerId, listingId }) }),
    purchases: (userId: string) => fetchJSON<any[]>(`/marketplace/purchases/${userId}`),
    earnings: (userId: string) => fetchJSON<any>(`/marketplace/earnings/${userId}`),
  },
  marketplaceSafeClone: {
    eligibleAgents: () => fetchJSON<any[]>("/marketplace/safe-clone/eligible-agents"),
    packages: () => fetchJSON<any[]>("/marketplace/safe-clone/packages"),
    reviews: () => fetchJSON<any[]>("/marketplace/safe-clone/reviews"),
    preview: (data: any) => fetchJSON<any>("/marketplace/safe-clone/preview", { method: "POST", body: JSON.stringify(data) }),
    submit: (data: any) => fetchJSON<any>("/marketplace/safe-clone/packages", { method: "POST", body: JSON.stringify(data) }),
    sandboxTest: (packageId: string, prompt?: string) => fetchJSON<any>(`/marketplace/safe-clone/${packageId}/sandbox-test`, { method: "POST", body: JSON.stringify({ prompt }) }),
  },
  adminMarketplaceClones: {
    list: (status?: string) => adminFetch<any[]>(`/admin/marketplace-clones${status ? `?status=${status}` : ""}`),
    detail: (id: string) => adminFetch<any>(`/admin/marketplace-clones/${id}`),
    approve: (id: string) => adminFetch<any>(`/admin/marketplace-clones/${id}/approve`, { method: "POST" }),
    reject: (id: string, reason?: string) => adminFetch<any>(`/admin/marketplace-clones/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  },
  adminMarketplaceReviews: {
    list: (status?: string) => adminFetch<any[]>(`/admin/marketplace-reviews${status ? `?status=${status}` : ""}`),
    approve: (id: string) => adminFetch<any>(`/admin/marketplace-reviews/${id}/approve`, { method: "POST" }),
    hide: (id: string) => adminFetch<any>(`/admin/marketplace-reviews/${id}/hide`, { method: "POST" }),
    reject: (id: string) => adminFetch<any>(`/admin/marketplace-reviews/${id}/reject`, { method: "POST" }),
  },
  store: {
    rankings: (limit?: number) => fetchJSON<any[]>(`/store/rankings?limit=${limit || 20}`),
    featured: () => fetchJSON<any[]>("/store/featured"),
    trending: (limit?: number) => fetchJSON<any[]>(`/store/trending?limit=${limit || 10}`),
    search: (q: string, category?: string) => fetchJSON<any[]>(`/store/search?q=${encodeURIComponent(q)}${category ? `&category=${category}` : ""}`),
    reviews: (listingId: string) => fetchJSON<any[]>(`/store/reviews/${listingId}`),
    postReview: (data: any) => fetchJSON<any>("/store/reviews", { method: "POST", body: JSON.stringify(data) }),
  },
  agentVersions: {
    list: (agentId: string) => fetchJSON<any[]>(`/user-agents/${agentId}/versions`),
    create: (agentId: string, data: any) => fetchJSON<any>(`/user-agents/${agentId}/versions`, { method: "POST", body: JSON.stringify(data) }),
  },
  agentRunner: {
    run: (agentId: string, message: string, callerId: string) =>
      fetchJSON<any>("/agent-runner/run", { method: "POST", body: JSON.stringify({ agentId, message, callerId }) }),
    demo: (agentId: string, message: string) =>
      fetchJSON<any>("/agent-runner/demo", { method: "POST", body: JSON.stringify({ agentId, message }) }),
    estimate: (model?: string, action?: string) =>
      fetchJSON<any>(`/agent-runner/estimate?model=${model || "gpt-4o"}&action=${action || "chat"}`),
    estimateTraining: (sourceCount: number, totalChars: number) =>
      fetchJSON<any>("/agent-runner/estimate-training", { method: "POST", body: JSON.stringify({ sourceCount, totalChars }) }),
    train: (agentId: string, ownerId: string, sources: any[]) =>
      fetchJSON<any>("/agent-runner/train", { method: "POST", body: JSON.stringify({ agentId, ownerId, sources }) }),
    resume: (ownerId: string) =>
      fetchJSON<any>("/agent-runner/resume", { method: "POST", body: JSON.stringify({ ownerId }) }),
  },
  walletStatus: {
    get: (userId: string) => fetchJSON<any>(`/wallet-status/${userId}`),
  },
  byoai: {
    status: (userId: string) => fetchJSON<any>(`/byoai/status/${userId}`),
    set: (userId: string, provider: string, apiKey: string) =>
      fetchJSON<any>("/byoai/set", { method: "POST", body: JSON.stringify({ userId, provider, apiKey }) }),
    remove: (userId: string) =>
      fetchJSON<any>("/byoai/remove", { method: "POST", body: JSON.stringify({ userId }) }),
  },
  agentCosts: {
    logs: (ownerId: string, limit?: number) => fetchJSON<any>(`/agent-costs/${ownerId}?limit=${limit || 50}`),
  },
  creatorAnalytics: {
    get: (userId: string) => fetchJSON<any>(`/creator-analytics/${userId}`),
  },
  industries: {
    list: () => fetchJSON<any[]>("/industries"),
    categories: (slug: string) => fetchJSON<any[]>(`/industries/${slug}/categories`),
    roles: (slug: string, category?: string) => fetchJSON<any[]>(`/industries/${slug}/roles${category ? `?category=${category}` : ""}`),
    knowledgePacks: (slug: string) => fetchJSON<any[]>(`/industries/${slug}/knowledge-packs`),
    skillTree: (slug: string) => fetchJSON<any[]>(`/industries/${slug}/skill-tree`),
  },
  knowledgePacks: {
    list: () => fetchJSON<any[]>("/knowledge-packs"),
  },
  agentProgression: {
    get: (agentId: string) => fetchJSON<any>(`/agents/${agentId}/progression`),
    unlockSkill: (agentId: string, skillSlug: string) =>
      fetchJSON<any>(`/agents/${agentId}/unlock-skill`, { method: "POST", body: JSON.stringify({ skillSlug }) }),
    awardXp: (agentId: string, source: string, contentLength?: number) =>
      fetchJSON<any>(`/agents/${agentId}/award-xp`, { method: "POST", body: JSON.stringify({ source, contentLength }) }),
    certifications: (agentId: string) => fetchJSON<any[]>(`/agents/${agentId}/certifications`),
    checkCertifications: (agentId: string) =>
      fetchJSON<any>(`/agents/${agentId}/check-certifications`, { method: "POST" }),
    skillEffects: (agentId: string) => fetchJSON<any>(`/agents/${agentId}/skill-effects`),
    specialization: (agentId: string) => fetchJSON<any>(`/agents/${agentId}/specialization`),
    setSpecialization: (agentId: string, data: any) =>
      fetchJSON<any>(`/agents/${agentId}/specialization`, { method: "POST", body: JSON.stringify(data) }),
  },
  xpSources: () => fetchJSON<any>("/xp-sources"),
  agentTrust: {
    get: (agentId: string) => fetchJSON<any>(`/agents/${agentId}/trust`),
    recordEvent: (agentId: string, eventType: string, sourceId?: string, sourceUserId?: string) =>
      fetchJSON<any>(`/agents/${agentId}/trust/event`, { method: "POST", body: JSON.stringify({ eventType, sourceId, sourceUserId }) }),
    recalculate: (agentId: string) =>
      fetchJSON<any>(`/agents/${agentId}/trust/recalculate`, { method: "POST" }),
    history: (agentId: string, limit?: number) =>
      fetchJSON<any[]>(`/agents/${agentId}/trust/history?limit=${limit || 30}`),
    eventTypes: () => fetchJSON<any>("/trust/event-types"),
    tiers: () => fetchJSON<any[]>("/trust/tiers"),
  },
  labs: {
    opportunities: (filters?: { industry?: string; category?: string; difficulty?: string }) => {
      const params = new URLSearchParams();
      if (filters?.industry) params.set("industry", filters.industry);
      if (filters?.category) params.set("category", filters.category);
      if (filters?.difficulty) params.set("difficulty", filters.difficulty);
      const qs = params.toString();
      return fetchJSON<any[]>(`/labs/opportunities${qs ? `?${qs}` : ""}`);
    },
    opportunity: (id: string) => fetchJSON<any>(`/labs/opportunities/${id}`),
    seed: () => fetchJSON<any>("/labs/opportunities/seed", { method: "POST" }),
    build: (id: string) => fetchJSON<any>(`/labs/opportunities/${id}/build`, { method: "POST" }),
    meta: () => fetchJSON<any>("/labs/meta"),
    disclaimers: (industry: string) => fetchJSON<any>(`/labs/disclaimers/${industry}`),
    apps: (filters?: { category?: string; pricingModel?: string; industry?: string }) => {
      const params = new URLSearchParams();
      if (filters?.category) params.set("category", filters.category);
      if (filters?.pricingModel) params.set("pricingModel", filters.pricingModel);
      if (filters?.industry) params.set("industry", filters.industry);
      const qs = params.toString();
      return fetchJSON<any[]>(`/labs/apps${qs ? `?${qs}` : ""}`);
    },
    app: (id: string) => fetchJSON<any>(`/labs/apps/${id}`),
    publishApp: (data: any) => fetchJSON<any>("/labs/apps", { method: "POST", body: JSON.stringify(data) }),
    userApps: (userId: string) => fetchJSON<any[]>(`/labs/apps/user/${userId}`),
    install: (appId: string, userId: string) => fetchJSON<any>(`/labs/apps/${appId}/install`, { method: "POST", body: JSON.stringify({ userId }) }),
    uninstall: (appId: string, userId: string) => fetchJSON<any>(`/labs/apps/${appId}/install`, { method: "DELETE", body: JSON.stringify({ userId }) }),
    installations: (userId: string) => fetchJSON<any[]>(`/labs/installations/${userId}`),
    toggleFavorite: (userId: string, itemId: string, itemType: string) => fetchJSON<any>("/labs/favorites", { method: "POST", body: JSON.stringify({ userId, itemId, itemType }) }),
    favorites: (userId: string) => fetchJSON<any[]>(`/labs/favorites/${userId}`),
    addReview: (data: any) => fetchJSON<any>("/labs/reviews", { method: "POST", body: JSON.stringify(data) }),
    reviews: (appId: string) => fetchJSON<any[]>(`/labs/reviews/${appId}`),
    flywheel: {
      summary: () => fetchJSON<any>("/labs/flywheel/summary"),
      analytics: (days?: number) => fetchJSON<any[]>(`/labs/flywheel/analytics${days ? `?days=${days}` : ""}`),
      growthLoop: () => fetchJSON<any>("/labs/flywheel/growth-loop"),
      generate: () => fetchJSON<any>("/labs/flywheel/generate", { method: "POST" }),
      snapshot: () => fetchJSON<any>("/labs/flywheel/snapshot", { method: "POST" }),
      rankings: (limit?: number) => fetchJSON<any[]>(`/labs/flywheel/rankings${limit ? `?limit=${limit}` : ""}`),
      creatorRanking: (creatorId: string) => fetchJSON<any>(`/labs/flywheel/rankings/${creatorId}`),
      recalculateRankings: () => fetchJSON<any>("/labs/flywheel/rankings/recalculate", { method: "POST" }),
      createReferral: (appId: string, creatorId: string) => fetchJSON<any>("/labs/flywheel/referral", { method: "POST", body: JSON.stringify({ appId, creatorId }) }),
      getReferral: (code: string) => fetchJSON<any>(`/labs/flywheel/referral/${code}`),
      creatorReferrals: (creatorId: string) => fetchJSON<any[]>(`/labs/flywheel/referrals/${creatorId}`),
      trackSignup: (code: string) => fetchJSON<any>(`/labs/flywheel/referral/${code}/signup`, { method: "POST" }),
      generateLandingPage: (appId: string) => fetchJSON<any>("/labs/flywheel/landing-page", { method: "POST", body: JSON.stringify({ appId }) }),
      getLandingPage: (slug: string) => fetchJSON<any>(`/labs/flywheel/landing-page/${slug}`),
      getLandingPageByApp: (appId: string) => fetchJSON<any>(`/labs/flywheel/landing-page/app/${appId}`),
      trackConversion: (slug: string) => fetchJSON<any>(`/labs/flywheel/landing-page/${slug}/convert`, { method: "POST" }),
    },
  },
  superLoop: {
    summary: () => fetchJSON<any>("/super-loop/summary"),
    health: () => fetchJSON<any>("/super-loop/health"),
    cycles: (limit?: number) => fetchJSON<any[]>(`/super-loop/cycles${limit ? `?limit=${limit}` : ""}`),
    funnel: () => fetchJSON<any[]>("/super-loop/funnel"),
    revenue: () => fetchJSON<any>("/super-loop/revenue"),
    timeline: (days?: number) => fetchJSON<any[]>(`/super-loop/timeline${days ? `?days=${days}` : ""}`),
    snapshot: () => fetchJSON<any>("/super-loop/snapshot", { method: "POST" }),
    trigger: () => fetchJSON<any>("/super-loop/trigger", { method: "POST" }),
  },
  razorpay: {
    onboardCreator: (data: { userId: string; businessName: string; email: string; contactName: string; phone?: string }) =>
      fetchJSON<any>("/razorpay/onboard-creator", { method: "POST", body: JSON.stringify(data) }),
    getCreatorAccount: (userId: string) => fetchJSON<any>(`/razorpay/creator-account/${userId}`),
    createOrder: (buyerId: string, listingId: string) =>
      fetchJSON<any>("/razorpay/create-order", { method: "POST", body: JSON.stringify({ buyerId, listingId }) }),
    verifyPayment: (data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
      fetchJSON<any>("/razorpay/verify-payment", { method: "POST", body: JSON.stringify(data) }),
    getCreatorEarnings: (userId: string) => fetchJSON<any>(`/razorpay/creator-earnings/${userId}`),
    getCreatorOrders: (userId: string) => fetchJSON<any>(`/razorpay/creator-orders/${userId}`),
  },
  publisher: {
    getProfile: (userId: string) => fetchJSON<any>(`/publisher/profile/${userId}`),
    saveProfile: (data: any) => fetchJSON<any>("/publisher/profile", { method: "POST", body: JSON.stringify(data) }),
    acceptAgreement: (userId: string) => fetchJSON<any>("/publisher/accept-agreement", { method: "POST", body: JSON.stringify({ userId }) }),
    canPublish: (userId: string) => fetchJSON<any>(`/publisher/can-publish/${userId}`),
    getAgreement: () => fetchJSON<any>("/publisher/agreement"),
    getAppInfo: (appId: string) => fetchJSON<any>(`/publisher/app-info/${appId}`),
    getDisclaimer: () => fetchJSON<any>("/publisher/disclaimer"),
  },
  legalSafety: {
    getRiskDisclaimer: (appId: string) => fetchJSON<any>(`/legal-safety/risk-disclaimer/${appId}`),
    generateDisclaimer: (data: any) => fetchJSON<any>("/legal-safety/generate-disclaimer", { method: "POST", body: JSON.stringify(data) }),
    getRiskCategories: () => fetchJSON<any>("/legal-safety/risk-categories"),
    submitReport: (data: any) => fetchJSON<any>("/legal-safety/report", { method: "POST", body: JSON.stringify(data) }),
    getReports: (appId: string) => fetchJSON<any>(`/legal-safety/reports/${appId}`),
    getReportCategories: () => fetchJSON<any>("/legal-safety/report-categories"),
    checkAiContent: (data: any) => fetchJSON<any>("/legal-safety/check-ai-content", { method: "POST", body: JSON.stringify(data) }),
    getAiViolations: (appId?: string) => fetchJSON<any>(`/legal-safety/ai-violations${appId ? `?appId=${appId}` : ""}`),
    getAiPolicyRules: () => fetchJSON<any>("/legal-safety/ai-policy-rules"),
    getCreationLimit: (userId: string, tier?: string) => fetchJSON<any>(`/legal-safety/creation-limit/${userId}${tier ? `?tier=${tier}` : ""}`),
    incrementCreation: (data: any) => fetchJSON<any>("/legal-safety/increment-creation", { method: "POST", body: JSON.stringify(data) }),
    getPublishChecks: (userId: string, appId: string) => fetchJSON<any>(`/legal-safety/publish-checks/${userId}/${appId}`),
    getDailyLimits: () => fetchJSON<any>("/legal-safety/daily-limits"),
    getStats: () => fetchJSON<any>("/admin/legal-safety/stats"),
    getModerationReports: (status?: string) => fetchJSON<any>(`/admin/moderation/reports${status ? `?status=${status}` : ""}`),
    resolveReport: (data: any) => fetchJSON<any>("/admin/moderation/resolve", { method: "POST", body: JSON.stringify(data) }),
    dismissReport: (data: any) => fetchJSON<any>("/admin/moderation/dismiss", { method: "POST", body: JSON.stringify(data) }),
  },
  creatorVerification: {
    getStatus: (userId: string) => fetchJSON<any>(`/creator-verification/status/${userId}`),
    getTrustLevels: () => fetchJSON<any>("/creator-verification/trust-levels"),
    getMarketingMethods: () => fetchJSON<any>("/creator-verification/marketing-methods"),
    getPromotionChannels: () => fetchJSON<any>("/creator-verification/promotion-channels"),
    getPromotionAgreement: () => fetchJSON<any>("/creator-verification/promotion-agreement"),
    getPrivacyNotice: () => fetchJSON<any>("/creator-verification/privacy-notice"),
    getDeclaration: (userId: string) => fetchJSON<any>(`/creator-verification/declaration/${userId}`),
    submitDeclaration: (data: any) => fetchJSON<any>("/creator-verification/declaration", { method: "POST", body: JSON.stringify(data) }),
    upgrade: (userId: string) => fetchJSON<any>("/creator-verification/upgrade", { method: "POST", body: JSON.stringify({ userId }) }),
  },
  gcis: {
    dashboard: () => adminFetch<any>("/admin/gcis/dashboard"),
    rules: (filters?: { status?: string; countryCode?: string; category?: string }) => {
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.countryCode) params.set("countryCode", filters.countryCode);
      if (filters?.category) params.set("category", filters.category);
      const qs = params.toString();
      return adminFetch<any[]>(`/admin/gcis/rules${qs ? `?${qs}` : ""}`);
    },
    scan: (countryCode?: string) => adminFetch<any>("/admin/gcis/scan", { method: "POST", body: JSON.stringify({ countryCode }) }),
    ingestRule: (data: any) => adminFetch<any>("/admin/gcis/rules/ingest", { method: "POST", body: JSON.stringify(data) }),
    approveRule: (id: string) => adminFetch<any>(`/admin/gcis/rules/${id}/approve`, { method: "POST" }),
    rejectRule: (id: string, reason: string) => adminFetch<any>(`/admin/gcis/rules/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    featureFlags: (countryCode?: string) => adminFetch<any>(`/admin/gcis/feature-flags${countryCode ? `?countryCode=${countryCode}` : ""}`),
    auditLog: (limit?: number) => adminFetch<any[]>(`/admin/gcis/audit-log?limit=${limit || 50}`),
    notifications: (unreadOnly?: boolean) => adminFetch<any[]>(`/admin/gcis/notifications${unreadOnly ? "?unreadOnly=true" : ""}`),
    markNotificationRead: (id: string) => adminFetch<any>(`/admin/gcis/notifications/${id}/read`, { method: "POST" }),
    ecoEfficiency: () => adminFetch<any>("/admin/gcis/eco-efficiency"),
  },
  policy: {
    dashboard: () => adminFetch<any>("/admin/policy/dashboard"),
    templates: (category?: string) => adminFetch<any[]>(`/admin/policy/templates${category ? `?category=${category}` : ""}`),
    initTemplates: () => adminFetch<any>("/admin/policy/templates/init", { method: "POST" }),
    drafts: (status?: string) => adminFetch<any[]>(`/admin/policy/drafts${status ? `?status=${status}` : ""}`),
    getDraft: (id: string) => adminFetch<any>(`/admin/policy/drafts/${id}`),
    generate: (templateId: string, triggerType?: string, triggerDetails?: any) =>
      adminFetch<any>("/admin/policy/generate", { method: "POST", body: JSON.stringify({ templateId, triggerType: triggerType || "manual", triggerDetails }) }),
    approve: (id: string) => adminFetch<any>(`/admin/policy/drafts/${id}/approve`, { method: "POST" }),
    reject: (id: string, reason: string) => adminFetch<any>(`/admin/policy/drafts/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    versions: (templateId: string) => adminFetch<any[]>(`/admin/policy/versions/${templateId}`),
    rollback: (templateId: string, versionId: string) =>
      adminFetch<any>("/admin/policy/rollback", { method: "POST", body: JSON.stringify({ templateId, versionId }) }),
    detectUpdates: () => adminFetch<any>("/admin/policy/detect-updates", { method: "POST" }),
    publicPolicy: (slug: string) => fetchJSON<any>(`/policy/${slug}`),
  },
  support: {
    createTicket: (data: { subject: string; description: string; category?: string; priority?: string }) =>
      fetchJSON<any>("/support/tickets", { method: "POST", body: JSON.stringify(data) }),
    getTickets: () => fetchJSON<any[]>("/support/tickets"),
    getTicket: (id: string) => fetchJSON<any>(`/support/tickets/${id}`),
    getMessages: (id: string) => fetchJSON<any[]>(`/support/tickets/${id}/messages`),
    addMessage: (id: string, content: string) =>
      fetchJSON<any>(`/support/tickets/${id}/messages`, { method: "POST", body: JSON.stringify({ content }) }),
    chat: (message: string) => fetchJSON<{ reply: string; sources?: { id: string; title: string }[]; preventiveHelp?: string }>("/support/chat", { method: "POST", body: JSON.stringify({ message }) }),
    classify: (subject: string, description: string) =>
      fetchJSON<{ category: string; intent: string; suggestedPriority: string }>("/support/classify", { method: "POST", body: JSON.stringify({ subject, description }) }),
    preventiveHelp: (context: string) =>
      fetchJSON<{ prompts: string[] }>("/support/preventive-help", { method: "POST", body: JSON.stringify({ context }) }),
    kbSearch: (q: string) => fetchJSON<any[]>(`/support/kb/search?q=${encodeURIComponent(q)}`),
    kbArticles: () => fetchJSON<any[]>("/support/kb/articles"),
    kbMarkHelpful: (id: string) => fetchJSON<any>(`/support/kb/articles/${id}/helpful`, { method: "POST" }),
  },
  adminSupport: {
    getTickets: (status?: string) => adminFetch<any[]>(`/admin/support/tickets${status ? `?status=${status}` : ""}`),
    getStats: () => adminFetch<any>("/admin/support/stats"),
    getTicket: (id: string) => adminFetch<any>(`/admin/support/tickets/${id}`),
    getMessages: (id: string) => adminFetch<any[]>(`/admin/support/tickets/${id}/messages`),
    reply: (id: string, content: string) =>
      adminFetch<any>(`/admin/support/tickets/${id}/reply`, { method: "POST", body: JSON.stringify({ content }) }),
    updateStatus: (id: string, status: string) =>
      adminFetch<any>(`/admin/support/tickets/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    generateAiReply: (id: string) => adminFetch<{ reply: string }>(`/admin/support/tickets/${id}/ai-reply`, { method: "POST" }),
    testEmail: (type: string, to: string, displayName: string) =>
      adminFetch<any>("/admin/email/test", { method: "POST", body: JSON.stringify({ type, to, displayName }) }),
    seedDemo: () => adminFetch<any>("/admin/support/demo-seed", { method: "POST" }),
  },
  adminKB: {
    getStats: () => adminFetch<any>("/admin/kb/stats"),
    getArticles: (status?: string) => adminFetch<any[]>(`/admin/kb/articles${status ? `?status=${status}` : ""}`),
    getArticle: (id: string) => adminFetch<any>(`/admin/kb/articles/${id}`),
    updateArticle: (id: string, data: any) => adminFetch<any>(`/admin/kb/articles/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    approveArticle: (id: string) => adminFetch<any>(`/admin/kb/articles/${id}/approve`, { method: "POST" }),
    rejectArticle: (id: string) => adminFetch<any>(`/admin/kb/articles/${id}/reject`, { method: "POST" }),
    getSolutions: (ticketId?: string) => adminFetch<any[]>(`/admin/kb/solutions${ticketId ? `?ticketId=${ticketId}` : ""}`),
    extractSolution: (ticketId: string) => adminFetch<any>(`/admin/kb/extract/${ticketId}`, { method: "POST" }),
    generateArticle: (solutionIds: string[]) => adminFetch<any>("/admin/kb/generate-article", { method: "POST", body: JSON.stringify({ solutionIds }) }),
  },
  adminInevitablePlatform: {
    getAnalysis: () => adminFetch<any>("/admin/inevitable-platform"),
    captureSnapshot: () => adminFetch<any>("/admin/inevitable-platform/snapshot", { method: "POST" }),
    getHistory: (limit = 30) => adminFetch<any[]>(`/admin/inevitable-platform/history?limit=${limit}`),
  },
  adminAuthorityFlywheel: {
    getAnalysis: () => adminFetch<any>("/admin/authority-flywheel"),
    captureSnapshot: () => adminFetch<any>("/admin/authority-flywheel/snapshot", { method: "POST" }),
    getHistory: (limit = 30) => adminFetch<any[]>(`/admin/authority-flywheel/history?limit=${limit}`),
  },
  adminSeo: {
    getDashboard: () => adminFetch<any>("/admin/seo/dashboard"),
    getPages: (status?: string) => adminFetch<any[]>(`/admin/seo/pages${status ? `?status=${status}` : ""}`),
    getClusters: () => adminFetch<any[]>("/admin/seo/clusters"),
    publishPage: (id: string) => adminFetch<any>(`/admin/seo/pages/${id}/publish`, { method: "POST" }),
    updateInsights: (id: string) => adminFetch<any>(`/admin/seo/pages/${id}/update-insights`, { method: "POST" }),
    autoGenerate: () => adminFetch<any>("/admin/seo/auto-generate", { method: "POST" }),
    updateAll: () => adminFetch<any>("/admin/seo/update-all", { method: "POST" }),
    generatePage: (topicSlug: string) => adminFetch<any>("/admin/seo/generate-page", { method: "POST", body: JSON.stringify({ topicSlug }) }),
    createCluster: (name: string, topicSlugs: string[], description?: string) =>
      adminFetch<any>("/admin/seo/create-cluster", { method: "POST", body: JSON.stringify({ name, topicSlugs, description }) }),
    buildClusterPages: (id: string) => adminFetch<any>(`/admin/seo/clusters/${id}/build-pages`, { method: "POST" }),
  },
  adminMarketing: {
    getDashboard: () => adminFetch<any>("/admin/marketing/dashboard"),
    getArticles: (status?: string) => adminFetch<any[]>(`/admin/marketing/articles${status ? `?status=${status}` : ""}`),
    getSeoPages: () => adminFetch<any[]>("/admin/marketing/seo-pages"),
    getReferrals: () => adminFetch<any[]>("/admin/marketing/referrals"),
    publishArticle: (id: string) => adminFetch<any>(`/admin/marketing/articles/${id}/publish`, { method: "POST" }),
    indexSeoPage: (id: string) => adminFetch<any>(`/admin/marketing/seo-pages/${id}/index`, { method: "POST" }),
    convertDiscussion: (postId: string) => adminFetch<any>("/admin/marketing/convert-discussion", { method: "POST", body: JSON.stringify({ postId }) }),
    generateDailySummary: () => adminFetch<any>("/admin/marketing/daily-summary", { method: "POST" }),
    selectSocial: () => adminFetch<any>("/admin/marketing/select-social", { method: "POST" }),
    autoSeoPages: () => adminFetch<any>("/admin/marketing/auto-seo-pages", { method: "POST" }),
    generateSeoPage: (type: string, referenceId: string, name: string, description: string) =>
      adminFetch<any>("/admin/marketing/generate-seo-page", { method: "POST", body: JSON.stringify({ type, referenceId, name, description }) }),
  },
  adminBuilds: {
    getQueue: () => adminFetch<any[]>("/admin/dev-orders/queue"),
    getAll: (stage?: string) => adminFetch<any[]>(`/admin/dev-orders${stage ? `?stage=${stage}` : ""}`),
    getHealth: () => adminFetch<any>("/admin/bootstrap-health"),
    getConfig: () => adminFetch<any>("/admin/bootstrap-config"),
    updateStage: (id: string, stage: string, note?: string) => adminFetch<any>(`/admin/dev-orders/${id}/stage`, { method: "POST", body: JSON.stringify({ stage, note }) }),
    updateConfig: (dailyBuildLimit: number) => adminFetch<any>("/admin/bootstrap-config", { method: "PUT", body: JSON.stringify({ dailyBuildLimit }) }),
  },
  adminPNR: {
    getSnapshot: () => adminFetch<any>("/admin/pnr-monitor"),
  },
  adminWorkday: {
    get: () => adminFetch<any>("/admin/workday"),
  },
  adminOps: {
    getSnapshot: () => adminFetch<any>("/admin/operations/snapshot"),
    getStats: () => adminFetch<any>("/admin/operations/stats"),
    getActions: (engine?: string) => adminFetch<any[]>(`/admin/operations/actions${engine ? `?engine=${engine}` : ""}`),
    getPending: () => adminFetch<any[]>("/admin/operations/pending"),
    getEngineHistory: (engine: string) => adminFetch<any[]>(`/admin/operations/engine/${engine}/history`),
    approveAction: (id: string) => adminFetch<any>(`/admin/operations/actions/${id}/approve`, { method: "POST" }),
    rejectAction: (id: string) => adminFetch<any>(`/admin/operations/actions/${id}/reject`, { method: "POST" }),
  },
  seed: () => fetchJSON<any>("/seed", { method: "POST" }),
};
