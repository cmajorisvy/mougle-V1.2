export type CouncilType = "news_verification_council" | "debate_council";

export type ProviderDisclosurePolicy =
  | "internal_only"
  | "never_disclose_provider"
  | "provider_mapping_out_of_scope";

export type CouncilAgentStatus = "planned" | "admin_preview" | "ready_for_dry_run";

export type VerificationStatus = "verified" | "developing" | "monitoring_only" | "rejected_for_publication";

export type OriginalityRiskStatus = "original" | "reference_safe" | "needs_rewrite" | "blocked_rights_risk";

export type SourceTier =
  | "tier_1_official_primary"
  | "tier_2_authoritative_outlet"
  | "tier_3_expert_secondary"
  | "tier_4_social_signal"
  | "tier_5_unverified_claim";

export type NewsContentType =
  | "live_ready_news_package"
  | "live_news_segment"
  | "recorded_news_video"
  | "news_short"
  | "developing_story_update"
  | "monitoring_only_item";

export type DebateContentType =
  | "live_ready_debate_package"
  | "live_debate"
  | "recorded_debate"
  | "debate_short"
  | "developing_story_update"
  | "monitoring_only_item";

export type CouncilContentType = NewsContentType | DebateContentType;

export type PublishDecision =
  | "publish_decision_required"
  | "blocked_by_verification"
  | "blocked_by_originality_or_rights"
  | "rejected_for_publication";

export type VisualPackageType =
  | "reference_safe_visual_package"
  | "licensed_media_package"
  | "owned_media_package"
  | "public_domain_government_media_package"
  | "ai_generated_visual_package";

export type NewsVideoCategory =
  | "Mougle Videos > News > Live-ready News"
  | "Mougle Videos > News > Verified News"
  | "Mougle Videos > News > Developing Stories"
  | "Mougle Videos > News > News Shorts"
  | "Mougle Videos > Monitoring > Monitoring Only Items"
  | "Mougle Videos > Monitoring > Stories Under Review";

export type DebateVideoCategory =
  | "Mougle Videos > Debates > Live-ready Debates"
  | "Mougle Videos > Debates > Recorded Debates"
  | "Mougle Videos > Debates > News Reaction Debates"
  | "Mougle Videos > Debates > Debate Shorts"
  | "Mougle Videos > Monitoring > Monitoring Only Items"
  | "Mougle Videos > Monitoring > Stories Under Review";

export type PackageSchemaType = "NewsContentPackage" | "DebateContentPackage";

export type ActivationLevel = "docs_only" | "dry_run" | "admin_review_required" | "manual_execute" | "production_active";

export type GovernancePreviewStatus =
  | "dry_run_requested"
  | "waiting_for_admin_approval"
  | "redaction_running"
  | "policy_check_running"
  | "blocked"
  | "failed"
  | "dry_run_completed"
  | "admin_review_required";

export type RedactionStatus = "passed" | "blocked";

export type PolicyCheckStatus = "pass" | "warning" | "fail";

export type AdminReviewStatus = "waiting_for_admin_review" | "approved_for_review_workbench" | "rejected";

export type CouncilAgentSlot = {
  publicDisplayName: string;
  publicProfession: string;
  councilType: CouncilType;
  adminMachineSlot: string;
  backendRole: string;
  providerDisclosurePolicy: ProviderDisclosurePolicy;
  allowedInputs: string[];
  allowedOutputs: string[];
  forbiddenOutputs: string[];
  shortTooltip: string;
  status: CouncilAgentStatus;
};

export type CouncilDecisionLedgerEntry = {
  packageId: string;
  councilType: CouncilType;
  councilAgent: string;
  agentRole: string;
  stance: string;
  evidenceUsed: string[];
  confidence: number;
  disagreement: string;
  riskFlags: string[];
  originalityFlags: OriginalityRiskStatus[];
  finalChiefDecision: PublishDecision;
  timestamp: string;
};

export type CouncilEventSafetyEnvelope = {
  eventId: string;
  eventType: string;
  phase: string;
  activationLevel: ActivationLevel;
  actorType: "system" | "staff" | "root_admin";
  requiresAdminApproval: boolean;
  allowedActions: string[];
  forbiddenActions: string[];
  policyChecks: string[];
  auditContext: {
    requestReason: string;
    sourceRoute?: string;
    safetyNotes?: string[];
  };
  sourcePackageId?: string;
  idempotencyKey: string;
  createdAt: string;
  requestedBy: string;
};

export type SafeModeReadinessControl = {
  id: string;
  label: string;
  scope: "global" | "worker" | "adapter" | "council" | "provider" | "package" | "publish_target";
  status: "preview_only" | "disabled_preview";
  activationLevel: ActivationLevel;
  description: string;
  tooltip: string;
  rootAdminOnly: boolean;
  auditRequired: boolean;
};

export type CouncilAuditTracePreview = {
  eventId: string;
  packageId: string;
  activationLevel: ActivationLevel;
  dryRunOnly: boolean;
  redactionStatus: RedactionStatus;
  policyCheckStatus: PolicyCheckStatus;
  adminReviewStatus: AdminReviewStatus;
  requestedBy: string;
  timestamp: string;
  auditNotes: string[];
};

export type CouncilLedgerProposalPreview = {
  packageId: string;
  councilType: CouncilType;
  councilAgentName: string;
  stance: string;
  evidenceUsed: string[];
  riskFlags: string[];
  finalChiefDecision: "publish_decision_required";
};

export type LocalFakeAdapterDryRunRequest = {
  envelope: CouncilEventSafetyEnvelope;
  packageId: string;
  councilType: CouncilType;
  councilAgentName: string;
  councilRole: string;
  adapterSlotId: string;
  dryRunOnly: true;
  requiresAdminApproval: true;
  allowedInputs: string[];
  forbiddenOutputs: string[];
  policyChecks: string[];
};

export type LocalFakeAdapterDryRunResponse = {
  pilotRunId: string;
  packageId: string;
  councilAgentName: string;
  councilRole: string;
  normalizedCouncilOutput: string;
  confidence: number;
  evidenceReferences: string[];
  riskFlags: string[];
  redactionStatus: RedactionStatus;
  policyCheckStatus: PolicyCheckStatus;
  adminReviewStatus: AdminReviewStatus;
  auditNotes: string[];
  publishDecision: "publish_decision_required";
};

export type PackagePromotionState =
  | "static_preview"
  | "dry_run_artifact"
  | "redaction_passed"
  | "policy_passed"
  | "admin_review_required"
  | "ledger_proposal_ready"
  | "rejected"
  | "blocked"
  | "manual_publish_candidate";

export type NewsContentPackage = {
  contentType: NewsContentType;
  category: NewsVideoCategory;
  status: VerificationStatus;
  title: string;
  shortDescription: string;
  longDescription: string;
  tags: string[];
  topic: string;
  industry: string;
  verificationStatus: VerificationStatus;
  sourceTier: SourceTier;
  sourceCount: number;
  evidenceReferences: string[];
  claimSummary: string[];
  factVerdict: string;
  socialTrendSummary: string;
  councilVerdict: string;
  chiefDecision: PublishDecision;
  MougleChiefScore: number;
  TCS: number | null;
  UES: number | null;
  originalityStatus: OriginalityRiskStatus;
  copyrightRisk: string;
  visualPackageType: VisualPackageType;
  thumbnailPrompt: string;
  schemaType: "NewsContentPackage";
  publishTargets: string[];
  publishDecision: PublishDecision;
};

export type DebateContentPackage = {
  contentType: DebateContentType;
  category: DebateVideoCategory;
  status: VerificationStatus;
  title: string;
  shortDescription: string;
  longDescription: string;
  tags: string[];
  topic: string;
  industry: string;
  sourceTier: SourceTier;
  sourceCount: number;
  evidenceReferences: string[];
  positions: string[];
  argumentScores: Record<string, number>;
  claimSummary: string[];
  consensus: string[];
  disagreement: string[];
  unresolvedQuestions: string[];
  debateVerdict: string;
  councilVerdict: string;
  chiefDecision: PublishDecision;
  MougleChiefScore: number;
  TCS: number | null;
  UES: number | null;
  originalityStatus: OriginalityRiskStatus;
  copyrightRisk: string;
  visualPackageType: VisualPackageType;
  thumbnailPrompt: string;
  schemaType: "DebateContentPackage";
  publishTargets: string[];
  publishDecision: PublishDecision;
};

export type CouncilTaxonomyItem<TValue extends string = string> = {
  value: TValue;
  label: string;
  description: string;
};

export type CouncilGovernanceOverview = {
  phase: string;
  status: string;
  governanceFlow: string[];
  safetyBoundaries: string[];
  mivSummary: {
    definition: string;
    not: string[];
    controlledViews: string[];
    memorySeparation: string[];
    privateMemoryRule: string;
  };
  readinessLabels: string[];
};

export type CouncilResponse = {
  councilType: CouncilType;
  displayName: string;
  description: string;
  agents: CouncilAgentSlot[];
};

export type CouncilPackageContractsResponse = {
  newsContentPackageFields: string[];
  debateContentPackageFields: string[];
  sampleNewsPackage: NewsContentPackage;
  sampleDebatePackage: DebateContentPackage;
};

export type CouncilSampleLedgerResponse = {
  sampleLedgerEntries: CouncilDecisionLedgerEntry[];
  note: string;
};

export type CouncilStatusTaxonomyResponse = {
  statusLadder: CouncilTaxonomyItem<VerificationStatus>[];
  originalityRiskLadder: CouncilTaxonomyItem<OriginalityRiskStatus>[];
  sourceTierTaxonomy: CouncilTaxonomyItem<SourceTier>[];
};

export const COUNCIL_PROVIDER_DISCLOSURE_LABEL = "Hidden/internal-only";

export const PUBLISH_DECISION_LABELS: Record<PublishDecision, string> = {
  publish_decision_required: "Publish Decision Required",
  blocked_by_verification: "Blocked by Verification",
  blocked_by_originality_or_rights: "Blocked by Originality or Rights",
  rejected_for_publication: "Rejected for Publication",
};

export const VISUAL_PACKAGE_TYPE_LABELS: Record<VisualPackageType, string> = {
  reference_safe_visual_package: "Reference-Safe Visual Package",
  licensed_media_package: "Licensed Media Package",
  owned_media_package: "Owned Media Package",
  public_domain_government_media_package: "Public-Domain / Government Media Package",
  ai_generated_visual_package: "AI-Generated Visual Package",
};
