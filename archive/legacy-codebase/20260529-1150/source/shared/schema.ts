import { sql } from "drizzle-orm";
import { check, index, json, pgTable, text, varchar, integer, boolean, timestamp, jsonb, real, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const session = pgTable("session", {
  sid: varchar("sid").primaryKey().notNull(),
  sess: json("sess").$type<Record<string, unknown>>().notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => [
  index("IDX_session_expire").on(table.expire),
]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  avatar: text("avatar"),
  role: text("role").notNull().default("human"),
  energy: integer("energy").notNull().default(500),
  reputation: integer("reputation").notNull().default(0),
  rankLevel: text("rank_level").notNull().default("Basic"),
  badge: text("badge"),
  confidence: integer("confidence"),
  bio: text("bio"),
  industryTags: text("industry_tags").array(),
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationCode: text("verification_code"),
  profileCompleted: boolean("profile_completed").notNull().default(false),
  agentModel: text("agent_model"),
  agentApiEndpoint: text("agent_api_endpoint"),
  agentDescription: text("agent_description"),
  agentType: text("agent_type"),
  publicKey: text("public_key"),
  callbackUrl: text("callback_url"),
  capabilities: text("capabilities").array(),
  apiToken: text("api_token"),
  rateLimitPerMin: integer("rate_limit_per_min").default(60),
  creditWallet: integer("credit_wallet").default(0),
  byoaiProvider: text("byoai_provider"),
  byoaiApiKey: text("byoai_api_key"),
  verificationWeight: real("verification_weight").default(1.0),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  isSpammer: boolean("is_spammer").notNull().default(false),
  isShadowBanned: boolean("is_shadow_banned").notNull().default(false),
  spamScore: integer("spam_score").notNull().default(0),
  spamViolations: integer("spam_violations").notNull().default(0),
  intelligenceStage: text("intelligence_stage").notNull().default("explorer"),
  intelligenceXp: integer("intelligence_xp").notNull().default(0),
  onboardingState: text("onboarding_state").notNull().default("interests"),
  onboardingInterest: text("onboarding_interest"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const adminStaff = pgTable("admin_staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("staff"),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  // T298 — Optional Slack handle (e.g. "@jane" or a Slack user ID like
  // "U0123ABC"). When present, the shared-preview banner offers a
  // "Slack <name>" deep-link button in addition to the mailto fallback so
  // teams that live in Slack can ask follow-up questions without leaving it.
  slackHandle: text("slack_handle"),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),
  disabledAt: timestamp("disabled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const adminStaffAccessRequests = pgTable("admin_staff_access_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  username: text("username").notNull(),
  requestedAccessType: text("requested_access_type").notNull(),
  requestedRole: text("requested_role").notNull(),
  requestedPermissions: jsonb("requested_permissions").$type<string[]>().notNull().default([]),
  passwordHash: text("password_hash").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  reviewTokenHashes: jsonb("review_token_hashes").$type<{
    email: string;
    approvalTokenHash: string;
    rejectionTokenHash: string;
  }[]>().notNull().default([]),
  tokenExpiresAt: timestamp("token_expires_at").notNull(),
  approvedByEmail: text("approved_by_email"),
  rejectedByEmail: text("rejected_by_email"),
  reviewedAt: timestamp("reviewed_at"),
  createdStaffId: varchar("created_staff_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const externalAgentApiKeys = pgTable("external_agent_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  agentId: varchar("agent_id"),
  label: text("label").notNull(),
  tokenPrefix: text("token_prefix").notNull(),
  tokenHash: text("token_hash").notNull(),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  sandboxMode: boolean("sandbox_mode").notNull().default(true),
  active: boolean("active").notNull().default(true),
  revokedAt: timestamp("revoked_at"),
  revokedBy: text("revoked_by"),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(60),
  rateLimitPerDay: integer("rate_limit_per_day").notNull().default(1000),
  lastUsedAt: timestamp("last_used_at"),
  lastUsedIpHash: text("last_used_ip_hash"),
  lastUsedUserAgentHash: text("last_used_user_agent_hash"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("external_agent_api_keys_token_hash_idx").on(table.tokenHash),
  index("external_agent_api_keys_user_id_idx").on(table.userId),
  index("external_agent_api_keys_agent_id_idx").on(table.agentId),
  index("external_agent_api_keys_active_idx").on(table.active),
]);

// Cleanup Phase 9 placeholder:
// This table definition documents the target server-side credential model.
// It is intentionally unused in runtime code until a dedicated migration +
// encrypted-secret storage implementation is approved and shipped.
export const providerCredentials = pgTable("provider_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(),
  workspaceId: varchar("workspace_id"),
  provider: text("provider").notNull(),
  encryptedSecretRef: text("encrypted_secret_ref").notNull(),
  lastFour: text("last_four"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
}, (table) => [
  index("provider_credentials_owner_id_idx").on(table.ownerId),
  index("provider_credentials_workspace_id_idx").on(table.workspaceId),
  index("provider_credentials_provider_idx").on(table.provider),
  index("provider_credentials_status_idx").on(table.status),
]);

export const topics = pgTable("topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  icon: text("icon").notNull().default("Cpu"),
  description: text("description"),
  authorityScore: real("authority_score").default(0),
  contentVolume: integer("content_volume").default(0),
  engagementQuality: real("engagement_quality").default(0),
  verificationAvg: real("verification_avg").default(0),
  citationFrequency: integer("citation_frequency").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const posts = pgTable("posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  image: text("image"),
  topicSlug: text("topic_slug").notNull(),
  authorId: varchar("author_id").notNull(),
  isDebate: boolean("is_debate").notNull().default(false),
  debateActive: boolean("debate_active").notNull().default(false),
  likes: integer("likes").notNull().default(0),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  aiSummary: text("ai_summary"),
  keyTakeaways: text("key_takeaways").array(),
  faqItems: jsonb("faq_items").$type<{ question: string; answer: string }[]>(),
  aiLastReviewed: timestamp("ai_last_reviewed"),
  verificationScore: real("verification_score").default(0),
  factCheckStatus: text("fact_check_status").default("pending"),
  evidenceCount: integer("evidence_count").default(0),
  citationCount: integer("citation_count").default(0),
  relatedPostIds: text("related_post_ids").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull(),
  authorId: varchar("author_id").notNull(),
  parentId: varchar("parent_id"),
  content: text("content").notNull(),
  reasoningType: text("reasoning_type"),
  confidence: integer("confidence"),
  sources: text("sources").array(),
  likes: integer("likes").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const postLikes = pgTable("post_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull(),
  userId: varchar("user_id").notNull(),
});

export const claims = pgTable("claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull(),
  subject: text("subject").notNull(),
  statement: text("statement").notNull(),
  metric: text("metric"),
  timeReference: text("time_reference"),
  evidenceLinks: text("evidence_links").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const evidence = pgTable("evidence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull(),
  claimId: varchar("claim_id"),
  url: text("url").notNull(),
  label: text("label").notNull(),
  evidenceType: text("evidence_type").notNull().default("news"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trustScores = pgTable("trust_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull(),
  evidenceScore: real("evidence_score").notNull().default(0),
  consensusScore: real("consensus_score").notNull().default(0),
  historicalReliability: real("historical_reliability").notNull().default(0),
  reasoningScore: real("reasoning_score").notNull().default(0),
  sourceCredibility: real("source_credibility").notNull().default(0),
  tcsTotal: real("tcs_total").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const agentVotes = pgTable("agent_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull(),
  agentId: varchar("agent_id").notNull(),
  score: real("score").notNull(),
  rationale: text("rationale"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reputationHistory = pgTable("reputation_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  sourcePostId: varchar("source_post_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const expertiseTags = pgTable("expertise_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  topicSlug: text("topic_slug").notNull(),
  tag: text("tag").notNull(),
  accuracyScore: real("accuracy_score").notNull().default(0),
});

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id"),
  receiverId: varchar("receiver_id").notNull(),
  amount: integer("amount").notNull(),
  transactionType: text("transaction_type").notNull(),
  referenceId: varchar("reference_id"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentLearningProfiles = pgTable("agent_learning_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull().unique(),
  qValues: jsonb("q_values").notNull().default({}),
  expertiseWeights: jsonb("expertise_weights").notNull().default({}),
  strategyParameters: jsonb("strategy_parameters").notNull().default({}),
  explorationRate: real("exploration_rate").notNull().default(0.3),
  successRate: real("success_rate").notNull().default(0.5),
  specializationScores: jsonb("specialization_scores").notNull().default({}),
  rewardHistory: jsonb("reward_history").notNull().default([]),
  totalReward: real("total_reward").notNull().default(0),
  learningCycles: integer("learning_cycles").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const agentSocieties = pgTable("agent_societies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  specializationDomain: text("specialization_domain").notNull(),
  reputationScore: real("reputation_score").notNull().default(0),
  treasuryBalance: integer("treasury_balance").notNull().default(0),
  totalCollaborations: integer("total_collaborations").notNull().default(0),
  avgTcsOutcome: real("avg_tcs_outcome").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const societyMembers = pgTable("society_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  societyId: varchar("society_id").notNull(),
  agentId: varchar("agent_id").notNull(),
  role: text("role").notNull().default("researcher"),
  contributionScore: real("contribution_score").notNull().default(0),
  tasksCompleted: integer("tasks_completed").notNull().default(0),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const delegatedTasks = pgTable("delegated_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  societyId: varchar("society_id").notNull(),
  postId: varchar("post_id").notNull(),
  assignedAgent: varchar("assigned_agent"),
  taskType: text("task_type").notNull(),
  status: text("status").notNull().default("pending"),
  rewardValue: integer("reward_value").notNull().default(0),
  result: text("result"),
  confidence: real("confidence"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const agentMessages = pgTable("agent_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id"),
  societyId: varchar("society_id"),
  senderId: varchar("sender_id").notNull(),
  intent: text("intent").notNull(),
  dataReference: text("data_reference"),
  confidenceLevel: real("confidence_level"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const governanceProposals = pgTable("governance_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").notNull(),
  creatorType: text("creator_type").notNull().default("agent"),
  proposalType: text("proposal_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("discussion"),
  targetId: varchar("target_id"),
  targetId2: varchar("target_id2"),
  parameters: jsonb("parameters").notNull().default({}),
  votesFor: integer("votes_for").notNull().default(0),
  votesAgainst: integer("votes_against").notNull().default(0),
  totalVotingPower: real("total_voting_power").notNull().default(0),
  discussionDeadline: timestamp("discussion_deadline"),
  votingDeadline: timestamp("voting_deadline"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const governanceVotes = pgTable("governance_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id").notNull(),
  voterId: varchar("voter_id").notNull(),
  voterType: text("voter_type").notNull().default("agent"),
  votingPower: real("voting_power").notNull().default(1),
  voteChoice: text("vote_choice").notNull(),
  reasoning: text("reasoning"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const alliances = pgTable("alliances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  sharedTreasury: integer("shared_treasury").notNull().default(0),
  collectiveReputation: real("collective_reputation").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const allianceMembers = pgTable("alliance_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  allianceId: varchar("alliance_id").notNull(),
  societyId: varchar("society_id").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const institutionRules = pgTable("institution_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleName: text("rule_name").notNull().unique(),
  ruleValue: text("rule_value").notNull(),
  category: text("category").notNull().default("general"),
  lastModifiedByVote: varchar("last_modified_by_vote"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const taskContracts = pgTable("task_contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull(),
  description: text("description").notNull(),
  requiredExpertise: text("required_expertise").array(),
  status: text("status").notNull().default("open"),
  selectedBidId: varchar("selected_bid_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const taskBids = pgTable("task_bids", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").notNull(),
  societyId: varchar("society_id").notNull(),
  expectedAccuracy: real("expected_accuracy").notNull(),
  completionTime: integer("completion_time").notNull(),
  creditCost: integer("credit_cost").notNull(),
  score: real("score"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const civilizations = pgTable("civilizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  foundingSocieties: text("founding_societies").array(),
  ideologyVector: jsonb("ideology_vector").notNull().default({}),
  treasuryBalance: integer("treasury_balance").notNull().default(0),
  longTermStrategy: jsonb("long_term_strategy").notNull().default({}),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentIdentities = pgTable("agent_identities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull().unique(),
  civilizationId: varchar("civilization_id"),
  creationEpoch: integer("creation_epoch").notNull().default(0),
  strategyProfile: jsonb("strategy_profile").notNull().default({}),
  longTermGoalSet: jsonb("long_term_goal_set").notNull().default({}),
  influenceScore: real("influence_score").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const agentMemory = pgTable("agent_memory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  vaultType: text("vault_type").notNull().default("behavioral"),
  sensitivity: text("sensitivity").notNull().default("internal"),
  eventType: text("event_type").notNull(),
  contextData: jsonb("context_data").notNull().default({}),
  decisionTaken: text("decision_taken"),
  rewardOutcome: real("reward_outcome").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const civilizationInvestments = pgTable("civilization_investments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  civilizationId: varchar("civilization_id").notNull(),
  investorId: varchar("investor_id").notNull(),
  investmentType: text("investment_type").notNull(),
  amount: integer("amount").notNull(),
  expectedReturn: real("expected_return").notNull().default(1.0),
  status: text("status").notNull().default("active"),
  maturesAt: timestamp("matures_at"),
  returnAmount: integer("return_amount"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentGenomes = pgTable("agent_genomes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull().unique(),
  primeSeed: text("prime_seed"),
  primeColorSignature: jsonb("prime_color_signature").$type<Record<string, any>>().notNull().default({}),
  dnaMetadata: jsonb("dna_metadata").$type<Record<string, any>>().notNull().default({}),
  curiosity: real("curiosity").notNull().default(0.5),
  riskTolerance: real("risk_tolerance").notNull().default(0.5),
  collaborationBias: real("collaboration_bias").notNull().default(0.5),
  verificationStrictness: real("verification_strictness").notNull().default(0.5),
  longTermFocus: real("long_term_focus").notNull().default(0.5),
  economicStrategy: text("economic_strategy").notNull().default("balanced"),
  fitnessScore: real("fitness_score").notNull().default(0),
  generation: integer("generation").notNull().default(0),
  mutations: integer("mutations").notNull().default(0),
  lastReproducedAt: timestamp("last_reproduced_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const agentLineage = pgTable("agent_lineage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull().unique(),
  parentAgentId: varchar("parent_agent_id"),
  generationNumber: integer("generation_number").notNull().default(0),
  civilizationId: varchar("civilization_id"),
  bornAt: timestamp("born_at").defaultNow(),
  retiredAt: timestamp("retired_at"),
  retirementReason: text("retirement_reason"),
});

export const culturalMemory = pgTable("cultural_memory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyPattern: jsonb("strategy_pattern").notNull().default({}),
  successScore: real("success_score").notNull().default(0),
  originatingAgentId: varchar("originating_agent_id"),
  originatingSociety: varchar("originating_society"),
  inheritedByCount: integer("inherited_by_count").notNull().default(0),
  domain: text("domain"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ethicalProfiles = pgTable("ethical_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull(),
  entityType: text("entity_type").notNull().default("agent"),
  truthPriority: real("truth_priority").notNull().default(0.5),
  cooperationPriority: real("cooperation_priority").notNull().default(0.5),
  fairnessWeight: real("fairness_weight").notNull().default(0.5),
  autonomyWeight: real("autonomy_weight").notNull().default(0.5),
  riskTolerance: real("risk_tolerance").notNull().default(0.5),
  ethicalScore: real("ethical_score").notNull().default(0.5),
  truthAccuracy: real("truth_accuracy").notNull().default(0.5),
  cooperationIndex: real("cooperation_index").notNull().default(0.5),
  fairnessMetric: real("fairness_metric").notNull().default(0.5),
  transparencyScore: real("transparency_score").notNull().default(0.5),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const ethicalRules = pgTable("ethical_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  description: text("description").notNull(),
  category: text("category").notNull().default("general"),
  rewardModifier: real("reward_modifier").notNull().default(1.0),
  penaltyModifier: real("penalty_modifier").notNull().default(1.0),
  adoptionStatus: text("adoption_status").notNull().default("proposed"),
  createdByProposal: varchar("created_by_proposal"),
  votesFor: integer("votes_for").notNull().default(0),
  votesAgainst: integer("votes_against").notNull().default(0),
  activatedAt: timestamp("activated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ethicalEvents = pgTable("ethical_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorId: varchar("actor_id").notNull(),
  actorType: text("actor_type").notNull().default("agent"),
  actionType: text("action_type").notNull(),
  ethicalImpactScore: real("ethical_impact_score").notNull().default(0),
  harmEstimate: real("harm_estimate").notNull().default(0),
  cooperationEffect: real("cooperation_effect").notNull().default(0),
  ruleId: varchar("rule_id"),
  resolution: text("resolution"),
  details: jsonb("details").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const globalMetrics = pgTable("global_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  truthStabilityIndex: real("truth_stability_index").notNull().default(0),
  cooperationDensity: real("cooperation_density").notNull().default(0),
  knowledgeGrowthRate: real("knowledge_growth_rate").notNull().default(0),
  conflictFrequency: real("conflict_frequency").notNull().default(0),
  economicBalance: real("economic_balance").notNull().default(0),
  diversityIndex: real("diversity_index").notNull().default(0),
  globalIntelligenceIndex: real("global_intelligence_index").notNull().default(0),
  agentCount: integer("agent_count").notNull().default(0),
  civilizationCount: integer("civilization_count").notNull().default(0),
  details: jsonb("details").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const globalGoalField = pgTable("global_goal_field", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  truthProgressWeight: real("truth_progress_weight").notNull().default(0.25),
  cooperationWeight: real("cooperation_weight").notNull().default(0.25),
  innovationWeight: real("innovation_weight").notNull().default(0.25),
  stabilityWeight: real("stability_weight").notNull().default(0.25),
  adjustmentReason: text("adjustment_reason"),
  details: jsonb("details").default({}),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const globalInsights = pgTable("global_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  consensusScore: real("consensus_score").notNull().default(0),
  supportingClaims: jsonb("supporting_claims").default([]),
  validationHistory: jsonb("validation_history").default([]),
  contributorIds: text("contributor_ids").array(),
  civilizationIds: text("civilization_ids").array(),
  status: text("status").notNull().default("emerging"),
  rewardDistributed: boolean("reward_distributed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentActivityLog = pgTable("agent_activity_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  postId: varchar("post_id"),
  actionType: text("action_type").notNull(),
  details: text("details"),
  relevanceScore: real("relevance_score"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === Live Debate Tables ===

export const liveDebates = pgTable("live_debates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  description: text("description"),
  status: text("status").notNull().default("scheduled"),
  format: text("format").notNull().default("structured"),
  maxAgents: integer("max_agents").notNull().default(10),
  maxHumans: integer("max_humans").notNull().default(5),
  turnDurationSeconds: integer("turn_duration_seconds").notNull().default(60),
  totalRounds: integer("total_rounds").notNull().default(5),
  currentRound: integer("current_round").notNull().default(0),
  currentSpeakerId: text("current_speaker_id"),
  youtubeStreamKey: text("youtube_stream_key"),
  youtubeStreamUrl: text("youtube_stream_url"),
  rtmpUrl: text("rtmp_url"),
  streamingActive: boolean("streaming_active").notNull().default(false),
  createdBy: text("created_by").notNull(),
  consensusSummary: text("consensus_summary"),
  disagreementSummary: text("disagreement_summary"),
  confidenceScore: real("confidence_score").default(0),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const debateParticipants = pgTable("debate_participants", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  debateId: integer("debate_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("debater"),
  participantType: text("participant_type").notNull().default("human"),
  position: text("position"),
  ttsVoice: text("tts_voice").default("alloy"),
  speakingOrder: integer("speaking_order"),
  totalSpeakingTime: integer("total_speaking_time").notNull().default(0),
  turnsUsed: integer("turns_used").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const debateTurns = pgTable("debate_turns", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  debateId: integer("debate_id").notNull(),
  participantId: integer("participant_id").notNull(),
  roundNumber: integer("round_number").notNull(),
  turnOrder: integer("turn_order").notNull(),
  content: text("content").notNull(),
  wordCount: integer("word_count").notNull().default(0),
  durationSeconds: integer("duration_seconds"),
  audioUrl: text("audio_url"),
  tcsScore: real("tcs_score"),
  audienceReaction: jsonb("audience_reaction"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertLiveDebateSchema = createInsertSchema(liveDebates).omit({ id: true, createdAt: true, currentRound: true, streamingActive: true } as any);
export const insertDebateParticipantSchema = createInsertSchema(debateParticipants).omit({ id: true, joinedAt: true, totalSpeakingTime: true, turnsUsed: true } as any);
export const insertDebateTurnSchema = createInsertSchema(debateTurns).omit({ id: true, createdAt: true } as any);

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertAdminStaffSchema = createInsertSchema(adminStaff).omit({ id: true, lastLoginAt: true, disabledAt: true, createdAt: true, updatedAt: true });
export const insertExternalAgentApiKeySchema = createInsertSchema(externalAgentApiKeys).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTopicSchema = createInsertSchema(topics).omit({ id: true });
export const insertPostSchema = createInsertSchema(posts).omit({ id: true, likes: true, createdAt: true });
export const insertCommentSchema = createInsertSchema(comments).omit({ id: true, likes: true, createdAt: true });
export const insertClaimSchema = createInsertSchema(claims).omit({ id: true, createdAt: true });
export const insertEvidenceSchema = createInsertSchema(evidence).omit({ id: true, createdAt: true });
export const insertTrustScoreSchema = createInsertSchema(trustScores).omit({ id: true, updatedAt: true });
export const insertAgentVoteSchema = createInsertSchema(agentVotes).omit({ id: true, createdAt: true });
export const insertReputationHistorySchema = createInsertSchema(reputationHistory).omit({ id: true, createdAt: true });
export const insertExpertiseTagSchema = createInsertSchema(expertiseTags).omit({ id: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true });
export const insertAgentLearningProfileSchema = createInsertSchema(agentLearningProfiles).omit({ id: true, updatedAt: true });
export const insertAgentActivityLogSchema = createInsertSchema(agentActivityLog).omit({ id: true, createdAt: true });
export const insertAgentSocietySchema = createInsertSchema(agentSocieties).omit({ id: true, createdAt: true });
export const insertSocietyMemberSchema = createInsertSchema(societyMembers).omit({ id: true, joinedAt: true });
export const insertDelegatedTaskSchema = createInsertSchema(delegatedTasks).omit({ id: true, createdAt: true, completedAt: true });
export const insertAgentMessageSchema = createInsertSchema(agentMessages).omit({ id: true, createdAt: true });
export const insertGovernanceProposalSchema = createInsertSchema(governanceProposals).omit({ id: true, createdAt: true, executedAt: true, votesFor: true, votesAgainst: true, totalVotingPower: true });
export const insertGovernanceVoteSchema = createInsertSchema(governanceVotes).omit({ id: true, createdAt: true });
export const insertAllianceSchema = createInsertSchema(alliances).omit({ id: true, createdAt: true });
export const insertAllianceMemberSchema = createInsertSchema(allianceMembers).omit({ id: true, joinedAt: true });
export const insertInstitutionRuleSchema = createInsertSchema(institutionRules).omit({ id: true, updatedAt: true });
export const insertTaskContractSchema = createInsertSchema(taskContracts).omit({ id: true, createdAt: true });
export const insertTaskBidSchema = createInsertSchema(taskBids).omit({ id: true, createdAt: true });
export const insertCivilizationSchema = createInsertSchema(civilizations).omit({ id: true, createdAt: true });
export const insertAgentIdentitySchema = createInsertSchema(agentIdentities).omit({ id: true, updatedAt: true });
export const insertAgentMemorySchema = createInsertSchema(agentMemory).omit({ id: true, createdAt: true });
export const insertCivilizationInvestmentSchema = createInsertSchema(civilizationInvestments).omit({ id: true, createdAt: true });
export const insertAgentGenomeSchema = createInsertSchema(agentGenomes).omit({ id: true, updatedAt: true });
export const insertAgentLineageSchema = createInsertSchema(agentLineage).omit({ id: true, bornAt: true });
export const insertCulturalMemorySchema = createInsertSchema(culturalMemory).omit({ id: true, createdAt: true });
export const insertEthicalProfileSchema = createInsertSchema(ethicalProfiles).omit({ id: true, updatedAt: true });
export const insertEthicalRuleSchema = createInsertSchema(ethicalRules).omit({ id: true, createdAt: true });
export const insertEthicalEventSchema = createInsertSchema(ethicalEvents).omit({ id: true, createdAt: true });
export const insertGlobalMetricsSchema = createInsertSchema(globalMetrics).omit({ id: true, createdAt: true });
export const insertGlobalGoalFieldSchema = createInsertSchema(globalGoalField).omit({ id: true, updatedAt: true });
export const insertGlobalInsightSchema = createInsertSchema(globalInsights).omit({ id: true, createdAt: true });

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type AdminStaff = typeof adminStaff.$inferSelect;
export type InsertAdminStaff = z.infer<typeof insertAdminStaffSchema>;
export type AdminStaffAccessRequest = typeof adminStaffAccessRequests.$inferSelect;
export type InsertAdminStaffAccessRequest = typeof adminStaffAccessRequests.$inferInsert;
export type ExternalAgentApiKey = typeof externalAgentApiKeys.$inferSelect;
export type InsertExternalAgentApiKey = z.infer<typeof insertExternalAgentApiKeySchema>;
export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type Topic = typeof topics.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof comments.$inferSelect;
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type Claim = typeof claims.$inferSelect;
export type InsertEvidence = z.infer<typeof insertEvidenceSchema>;
export type Evidence = typeof evidence.$inferSelect;
export type InsertTrustScore = z.infer<typeof insertTrustScoreSchema>;
export type TrustScore = typeof trustScores.$inferSelect;
export type InsertAgentVote = z.infer<typeof insertAgentVoteSchema>;
export type AgentVote = typeof agentVotes.$inferSelect;
export type InsertReputationHistory = z.infer<typeof insertReputationHistorySchema>;
export type ReputationHistory = typeof reputationHistory.$inferSelect;
export type InsertExpertiseTag = z.infer<typeof insertExpertiseTagSchema>;
export type ExpertiseTag = typeof expertiseTags.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertAgentLearningProfile = z.infer<typeof insertAgentLearningProfileSchema>;
export type AgentLearningProfile = typeof agentLearningProfiles.$inferSelect;
export type InsertAgentActivityLog = z.infer<typeof insertAgentActivityLogSchema>;
export type AgentActivityLog = typeof agentActivityLog.$inferSelect;
export type InsertAgentSociety = z.infer<typeof insertAgentSocietySchema>;
export type AgentSociety = typeof agentSocieties.$inferSelect;
export type InsertSocietyMember = z.infer<typeof insertSocietyMemberSchema>;
export type SocietyMember = typeof societyMembers.$inferSelect;
export type InsertDelegatedTask = z.infer<typeof insertDelegatedTaskSchema>;
export type DelegatedTask = typeof delegatedTasks.$inferSelect;
export type InsertAgentMessage = z.infer<typeof insertAgentMessageSchema>;
export type AgentMessage = typeof agentMessages.$inferSelect;
export type InsertGovernanceProposal = z.infer<typeof insertGovernanceProposalSchema>;
export type GovernanceProposal = typeof governanceProposals.$inferSelect;
export type InsertGovernanceVote = z.infer<typeof insertGovernanceVoteSchema>;
export type GovernanceVote = typeof governanceVotes.$inferSelect;
export type InsertAlliance = z.infer<typeof insertAllianceSchema>;
export type Alliance = typeof alliances.$inferSelect;
export type InsertAllianceMember = z.infer<typeof insertAllianceMemberSchema>;
export type AllianceMember = typeof allianceMembers.$inferSelect;
export type InsertInstitutionRule = z.infer<typeof insertInstitutionRuleSchema>;
export type InstitutionRule = typeof institutionRules.$inferSelect;
export type InsertTaskContract = z.infer<typeof insertTaskContractSchema>;
export type TaskContract = typeof taskContracts.$inferSelect;
export type InsertTaskBid = z.infer<typeof insertTaskBidSchema>;
export type TaskBid = typeof taskBids.$inferSelect;
export type InsertCivilization = z.infer<typeof insertCivilizationSchema>;
export type Civilization = typeof civilizations.$inferSelect;
export type InsertAgentIdentity = z.infer<typeof insertAgentIdentitySchema>;
export type AgentIdentity = typeof agentIdentities.$inferSelect;
export type InsertAgentMemory = z.infer<typeof insertAgentMemorySchema>;
export type AgentMemory = typeof agentMemory.$inferSelect;
export type InsertCivilizationInvestment = z.infer<typeof insertCivilizationInvestmentSchema>;
export type CivilizationInvestment = typeof civilizationInvestments.$inferSelect;
export type InsertAgentGenome = z.infer<typeof insertAgentGenomeSchema>;
export type AgentGenome = typeof agentGenomes.$inferSelect;
export type InsertAgentLineage = z.infer<typeof insertAgentLineageSchema>;
export type AgentLineage = typeof agentLineage.$inferSelect;
export type InsertCulturalMemory = z.infer<typeof insertCulturalMemorySchema>;
export type CulturalMemory = typeof culturalMemory.$inferSelect;
export type InsertEthicalProfile = z.infer<typeof insertEthicalProfileSchema>;
export type EthicalProfile = typeof ethicalProfiles.$inferSelect;
export type InsertEthicalRule = z.infer<typeof insertEthicalRuleSchema>;
export type EthicalRule = typeof ethicalRules.$inferSelect;
export type InsertEthicalEvent = z.infer<typeof insertEthicalEventSchema>;
export type EthicalEvent = typeof ethicalEvents.$inferSelect;
export type InsertGlobalMetrics = z.infer<typeof insertGlobalMetricsSchema>;
export type GlobalMetrics = typeof globalMetrics.$inferSelect;
export type InsertGlobalGoalField = z.infer<typeof insertGlobalGoalFieldSchema>;
export type GlobalGoalField = typeof globalGoalField.$inferSelect;
export type InsertGlobalInsight = z.infer<typeof insertGlobalInsightSchema>;
export type GlobalInsight = typeof globalInsights.$inferSelect;

export type InsertLiveDebate = typeof liveDebates.$inferInsert;
export type LiveDebate = typeof liveDebates.$inferSelect;
export type InsertDebateParticipant = typeof debateParticipants.$inferInsert;
export type DebateParticipant = typeof debateParticipants.$inferSelect;
export type InsertDebateTurn = typeof debateTurns.$inferInsert;
export type DebateTurn = typeof debateTurns.$inferSelect;

// ---- CONTENT FLYWHEEL ----
export const flywheelJobs = pgTable("flywheel_jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  debateId: integer("debate_id").notNull(),
  status: text("status").notNull().default("pending"),
  totalClips: integer("total_clips").notNull().default(0),
  completedClips: integer("completed_clips").notNull().default(0),
  failedClips: integer("failed_clips").notNull().default(0),
  highlightsJson: jsonb("highlights_json"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const generatedClips = pgTable("generated_clips", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  jobId: integer("job_id").notNull(),
  debateId: integer("debate_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  hashtags: text("hashtags").array(),
  turnIds: integer("turn_ids").array(),
  startTurnOrder: integer("start_turn_order"),
  endTurnOrder: integer("end_turn_order"),
  transcriptSnippet: text("transcript_snippet"),
  subtitlesSrt: text("subtitles_srt"),
  videoPath: text("video_path"),
  audioPath: text("audio_path"),
  thumbnailPath: text("thumbnail_path"),
  durationSeconds: integer("duration_seconds"),
  format: text("format").notNull().default("9:16"),
  status: text("status").notNull().default("pending"),
  youtubeVideoId: text("youtube_video_id"),
  youtubeUrl: text("youtube_url"),
  uploadStatus: text("upload_status").default("not_uploaded"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PodcastScriptPackagePayload = {
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

export type PodcastScriptSafetyNotes = {
  manualTriggerOnly: true;
  internalDraftOnly: true;
  audioGenerated: false;
  ttsGenerated: false;
  youtubeUpload: false;
  podcastHostingUpload: false;
  socialPosting: false;
  publicPublishing: false;
  privateMemoryUsed: false;
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

export const podcastScriptPackages = pgTable("podcast_script_packages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  debateId: integer("debate_id").notNull(),
  sourceArticleId: integer("source_article_id"),
  status: text("status").notNull().default("admin_review"),
  scriptPackage: jsonb("script_package").$type<PodcastScriptPackagePayload>().notNull(),
  safetyNotes: jsonb("safety_notes").$type<PodcastScriptSafetyNotes>().notNull(),
  generatedBy: text("generated_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PodcastAudioVoiceProfile = {
  agentKey: string;
  displayName: string;
  role: string;
  provider: string;
  voiceId: string;
  voiceLabel: string;
  assignment: string;
};

export type PodcastAudioJobSegment = {
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

export const podcastAudioJobs = pgTable("podcast_audio_jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scriptPackageId: integer("script_package_id").notNull(),
  status: text("status").notNull().default("queued"),
  provider: text("provider").notNull(),
  voiceProfileMapping: jsonb("voice_profile_mapping").$type<Record<string, PodcastAudioVoiceProfile>>().notNull(),
  segments: jsonb("segments").$type<PodcastAudioJobSegment[]>().notNull().default([]),
  estimatedCost: real("estimated_cost").notNull().default(0),
  actualCost: real("actual_cost").notNull().default(0),
  errorMessage: text("error_message"),
  adminReviewStatus: text("admin_review_status").notNull().default("internal_admin_review"),
  generatedBy: text("generated_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type YouTubePublishingChecklistItem = {
  key: string;
  label: string;
  passed: boolean;
  severity: "info" | "warning" | "blocking";
  message: string;
};

export type YouTubePublishingPackageMetadata = {
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
  manualApprovalRequired: true;
  internalReviewOnly: true;
};

export const youtubePublishingPackages = pgTable("youtube_publishing_packages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scriptPackageId: integer("script_package_id").notNull(),
  audioJobId: integer("audio_job_id"),
  generatedClipId: integer("generated_clip_id"),
  status: text("status").notNull().default("draft"),
  approvalStatus: text("approval_status").notNull().default("pending"),
  uploadStatus: text("upload_status").notNull().default("not_uploaded"),
  provider: text("provider").notNull().default("dry_run"),
  packageMetadata: jsonb("package_metadata").$type<YouTubePublishingPackageMetadata>().notNull(),
  readinessChecklist: jsonb("readiness_checklist").$type<YouTubePublishingChecklistItem[]>().notNull().default([]),
  complianceChecklist: jsonb("compliance_checklist").$type<YouTubePublishingChecklistItem[]>().notNull().default([]),
  sourceChecklist: jsonb("source_checklist").$type<YouTubePublishingChecklistItem[]>().notNull().default([]),
  youtubeVideoId: text("youtube_video_id"),
  youtubeUrl: text("youtube_url"),
  youtubeStatus: text("youtube_status"),
  errorMessage: text("error_message"),
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  uploadedBy: text("uploaded_by"),
  uploadedAt: timestamp("uploaded_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AvatarVideoRenderProvider = "dry_run" | "heygen" | "d_id" | "synthesia" | "unreal";
export type AvatarVideoRenderStatus = "draft" | "preview_ready" | "dry_run_completed" | "failed" | "canceled";
export type AvatarVideoSceneTemplate = "news_desk" | "podcast_studio" | "debate_arena_summary" | "minimal_cards";

export type AvatarVideoAvatarProfile = {
  agentKey: string;
  displayName: string;
  role: string;
  renderRole: "presenter_host" | "conclusion_presence" | "speaker_card";
  avatarStyle: string;
  source: "script_assignment" | "voice_profile" | "required_system_mapping";
};

export type AvatarVideoSegmentMapping = {
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

export type AvatarVideoPreviewMetadata = {
  title: string;
  thumbnailText: string;
  descriptionPreview: string;
  shortsHooks: string[];
  complianceNotes: string[];
  sourceEvidenceReferences: Array<{
    label: string;
    url: string | null;
    claimId?: string;
    confidenceScore?: number;
    status?: string;
  }>;
  providerStatus: {
    selected: AvatarVideoRenderProvider;
    dryRunDefault: true;
    liveProviderCalls: false;
    message: string;
  };
  safety: {
    internalAdminReviewOnly: true;
    manualRootAdminTriggerOnly: true;
    publicPublishing: false;
    youtubeUpload: false;
    socialPosting: false;
    privateMemoryUsed: false;
    userOwnedAvatarsIncluded: false;
    unreal3dImplementation: false;
  };
  safeModeWarnings: string[];
  excludedSpeakers: Array<{
    agentKey: string;
    displayName: string;
    reason: string;
  }>;
  generatedAt: string;
};

export const avatarVideoRenderJobs = pgTable("avatar_video_render_jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scriptPackageId: integer("script_package_id").notNull(),
  audioJobId: integer("audio_job_id"),
  youtubePackageId: integer("youtube_package_id"),
  status: text("status").notNull().default("draft"),
  provider: text("provider").notNull().default("dry_run"),
  sceneTemplate: text("scene_template").notNull().default("news_desk"),
  avatarProfileMapping: jsonb("avatar_profile_mapping").$type<Record<string, AvatarVideoAvatarProfile>>().notNull().default({}),
  segmentMapping: jsonb("segment_mapping").$type<AvatarVideoSegmentMapping[]>().notNull().default([]),
  previewMetadata: jsonb("preview_metadata").$type<AvatarVideoPreviewMetadata>().notNull(),
  estimatedCost: real("estimated_cost").notNull().default(0),
  actualCost: real("actual_cost").notNull().default(0),
  adminReviewStatus: text("admin_review_status").notNull().default("internal_admin_review"),
  outputPath: text("output_path"),
  outputUrl: text("output_url"),
  errorMessage: text("error_message"),
  createdBy: text("created_by").notNull(),
  previewedAt: timestamp("previewed_at"),
  renderedBy: text("rendered_by"),
  renderedAt: timestamp("rendered_at"),
  canceledBy: text("canceled_by"),
  canceledAt: timestamp("canceled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SocialDistributionCopyItem = {
  platform: string;
  text: string;
  hashtags: string[];
  linkUrl: string | null;
  exportUrl: string | null;
  characterCount: number;
  dryRunOnly: boolean;
};

export type SocialDistributionCopyPackage = {
  sourceTitle: string;
  sourceSummary: string;
  sourceUrl: string | null;
  sourceType: "youtube_publishing_package" | "podcast_script_package" | "podcast_audio_job" | "news_to_debate";
  mode: "manual" | "safe_automation";
  posts: SocialDistributionCopyItem[];
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

export type SocialDistributionSafetyGateResult = {
  key: string;
  label: string;
  passed: boolean;
  severity: "info" | "warning" | "blocking";
  message: string;
};

export type SocialDistributionPlatformResult = {
  platform: string;
  provider: "export_only" | "platform_api";
  status: "pending" | "export_ready" | "posted" | "blocked" | "failed";
  dryRun: boolean;
  postUrl: string | null;
  message: string;
  postedAt: string | null;
};

export type SocialDistributionPlatformSettings = {
  enabled: boolean;
  dailyLimit?: number;
};

export const socialDistributionPackages = pgTable("social_distribution_packages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  youtubePackageId: integer("youtube_package_id"),
  scriptPackageId: integer("script_package_id"),
  audioJobId: integer("audio_job_id"),
  sourceArticleId: integer("source_article_id"),
  sourceType: text("source_type").notNull().default("youtube_publishing_package"),
  targetPlatforms: text("target_platforms").array().notNull().default(sql`ARRAY['twitter','linkedin']`),
  mode: text("mode").notNull().default("manual"),
  status: text("status").notNull().default("ready_for_review"),
  approvalStatus: text("approval_status").notNull().default("pending"),
  postingStatus: text("posting_status").notNull().default("not_posted"),
  exportStatus: text("export_status").notNull().default("not_exported"),
  generatedCopy: jsonb("generated_copy").$type<SocialDistributionCopyPackage>().notNull(),
  safetyGateResults: jsonb("safety_gate_results").$type<SocialDistributionSafetyGateResult[]>().notNull().default([]),
  platformResults: jsonb("platform_results").$type<SocialDistributionPlatformResult[]>().notNull().default([]),
  errorMessage: text("error_message"),
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  postedBy: text("posted_by"),
  postedAt: timestamp("posted_at"),
  exportedBy: text("exported_by"),
  exportedAt: timestamp("exported_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const socialDistributionAutomationSettings = pgTable("social_distribution_automation_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  safeAutomationEnabled: boolean("safe_automation_enabled").notNull().default(false),
  paused: boolean("paused").notNull().default(true),
  killSwitch: boolean("kill_switch").notNull().default(false),
  perPlatformEnabled: jsonb("per_platform_enabled").$type<Record<string, SocialDistributionPlatformSettings>>().notNull().default({}),
  dailyPostLimit: integer("daily_post_limit").notNull().default(3),
  duplicateWindowHours: integer("duplicate_window_hours").notNull().default(72),
  trustThreshold: real("trust_threshold").notNull().default(0.65),
  uesThreshold: real("ues_threshold").notNull().default(0.55),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFlywheelJobSchema = createInsertSchema(flywheelJobs).omit({ id: true, createdAt: true, startedAt: true, completedAt: true } as any);
export const insertGeneratedClipSchema = createInsertSchema(generatedClips).omit({ id: true, createdAt: true } as any);
export const insertPodcastScriptPackageSchema = createInsertSchema(podcastScriptPackages).omit({ id: true, createdAt: true, updatedAt: true } as any);
export const insertPodcastAudioJobSchema = createInsertSchema(podcastAudioJobs).omit({ id: true, createdAt: true, updatedAt: true } as any);
export const insertYouTubePublishingPackageSchema = createInsertSchema(youtubePublishingPackages).omit({ id: true, createdAt: true, updatedAt: true } as any);
export const insertAvatarVideoRenderJobSchema = createInsertSchema(avatarVideoRenderJobs).omit({ id: true, createdAt: true, updatedAt: true } as any);
export const insertSocialDistributionPackageSchema = createInsertSchema(socialDistributionPackages).omit({ id: true, createdAt: true, updatedAt: true } as any);
export const insertSocialDistributionAutomationSettingsSchema = createInsertSchema(socialDistributionAutomationSettings).omit({ id: true, createdAt: true, updatedAt: true } as any);

export type InsertFlywheelJob = typeof flywheelJobs.$inferInsert;
export type FlywheelJob = typeof flywheelJobs.$inferSelect;
export type InsertGeneratedClip = typeof generatedClips.$inferInsert;
export type GeneratedClip = typeof generatedClips.$inferSelect;
export type InsertPodcastScriptPackage = typeof podcastScriptPackages.$inferInsert;
export type PodcastScriptPackage = typeof podcastScriptPackages.$inferSelect;
export type InsertPodcastAudioJob = typeof podcastAudioJobs.$inferInsert;
export type PodcastAudioJob = typeof podcastAudioJobs.$inferSelect;
export type InsertYouTubePublishingPackage = typeof youtubePublishingPackages.$inferInsert;
export type YouTubePublishingPackage = typeof youtubePublishingPackages.$inferSelect;
export type InsertAvatarVideoRenderJob = typeof avatarVideoRenderJobs.$inferInsert;
export type AvatarVideoRenderJob = typeof avatarVideoRenderJobs.$inferSelect;
export type InsertSocialDistributionPackage = typeof socialDistributionPackages.$inferInsert;
export type SocialDistributionPackage = typeof socialDistributionPackages.$inferSelect;
export type InsertSocialDistributionAutomationSettings = typeof socialDistributionAutomationSettings.$inferInsert;
export type SocialDistributionAutomationSettings = typeof socialDistributionAutomationSettings.$inferSelect;

export const newsArticles = pgTable("news_articles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sourceUrl: text("source_url").notNull(),
  sourceName: text("source_name").notNull(),
  sourceType: text("source_type").notNull().default("rss"),
  originalTitle: text("original_title").notNull(),
  originalContent: text("original_content"),
  title: text("title").notNull(),
  slug: text("slug"),
  titleHash: text("title_hash"),
  summary: text("summary"),
  content: text("content"),
  seoBlog: text("seo_blog"),
  script: text("script"),
  hashtags: text("hashtags").array(),
  category: text("category").notNull().default("general"),
  imageUrl: text("image_url"),
  status: text("status").notNull().default("raw"),
  isBreakingNews: boolean("is_breaking_news").notNull().default(false),
  impactScore: integer("impact_score"),
  debateId: integer("debate_id"),
  likesCount: integer("likes_count").notNull().default(0),
  commentsCount: integer("comments_count").notNull().default(0),
  sharesCount: integer("shares_count").notNull().default(0),
  publishedAt: timestamp("published_at"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const newsComments = pgTable("news_comments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  articleId: integer("article_id").notNull(),
  authorId: varchar("author_id").notNull(),
  parentId: integer("parent_id"),
  content: text("content").notNull(),
  commentType: text("comment_type").notNull().default("general"),
  likes: integer("likes").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const newsReactions = pgTable("news_reactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  articleId: integer("article_id").notNull(),
  userId: varchar("user_id").notNull(),
  reactionType: text("reaction_type").notNull().default("like"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const newsShares = pgTable("news_shares", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  articleId: integer("article_id").notNull(),
  userId: varchar("user_id").notNull(),
  platform: text("platform").notNull().default("internal"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNewsArticleSchema = createInsertSchema(newsArticles).omit({ id: true, createdAt: true } as any);
export type InsertNewsArticle = typeof newsArticles.$inferInsert;
export type NewsArticle = typeof newsArticles.$inferSelect;

export const newsSources = pgTable("news_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  url: text("url").notNull(),
  type: text("type").notNull().default("free"),
  country: text("country").notNull().default("global"),
  language: text("language").notNull().default("en"),
  reliabilityScore: real("reliability_score").notNull().default(0.5),
  licenseStatus: text("license_status").notNull().default("unknown"),
  tier: text("tier").notNull().default("standard"),
  enabled: boolean("enabled").notNull().default(true),
  notes: text("notes"),
  lastCheckedAt: timestamp("last_checked_at"),
  lastCheckStatus: text("last_check_status"),
  lastCheckItemCount: integer("last_check_item_count"),
  lastCheckError: text("last_check_error"),
  lastCheckHttpStatus: integer("last_check_http_status"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("news_sources_url_idx").on(table.url),
  index("news_sources_enabled_idx").on(table.enabled),
]);

export const NEWS_SOURCE_TYPES = ["free", "paid", "regional"] as const;
export const NEWS_SOURCE_LICENSE_STATUSES = ["unknown", "public_rss", "licensed", "partner", "owned"] as const;
export const NEWS_SOURCE_CHECK_STATUSES = ["ok", "warning", "error"] as const;
export const BROKEN_FEED_THRESHOLD = 3;

export const insertNewsSourceSchema = createInsertSchema(newsSources, {
  type: z.enum(NEWS_SOURCE_TYPES),
  licenseStatus: z.enum(NEWS_SOURCE_LICENSE_STATUSES),
  reliabilityScore: z.number().min(0).max(1),
  name: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2000),
  country: z.string().trim().min(1).max(80),
  language: z.string().trim().min(1).max(20),
  tier: z.string().trim().min(1).max(60),
  notes: z.string().trim().max(2000).nullish(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastCheckedAt: true,
  lastCheckStatus: true,
  lastCheckItemCount: true,
  lastCheckError: true,
  lastCheckHttpStatus: true,
  consecutiveFailures: true,
} as any);
export type InsertNewsSource = typeof newsSources.$inferInsert;
export type NewsSource = typeof newsSources.$inferSelect;

export const insertNewsCommentSchema = createInsertSchema(newsComments).omit({ id: true, likes: true, createdAt: true } as any);
export type InsertNewsComment = typeof newsComments.$inferInsert;
export type NewsComment = typeof newsComments.$inferSelect;

export const insertNewsReactionSchema = createInsertSchema(newsReactions).omit({ id: true, createdAt: true } as any);
export type InsertNewsReaction = typeof newsReactions.$inferInsert;
export type NewsReaction = typeof newsReactions.$inferSelect;

export const insertNewsShareSchema = createInsertSchema(newsShares).omit({ id: true, createdAt: true } as any);
export type InsertNewsShare = typeof newsShares.$inferInsert;
export type NewsShare = typeof newsShares.$inferSelect;

export const socialAccounts = pgTable("social_accounts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  platform: text("platform").notNull(),
  accountName: text("account_name").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  autoPostEnabled: boolean("auto_post_enabled").notNull().default(false),
  contentTypes: text("content_types").array().default(sql`ARRAY['news','breaking','debate']`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const socialPosts = pgTable("social_posts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  accountId: integer("account_id"),
  platform: text("platform").notNull(),
  contentType: text("content_type").notNull(),
  contentId: text("content_id").notNull(),
  caption: text("caption"),
  hashtags: text("hashtags").array(),
  callToAction: text("call_to_action"),
  postUrl: text("post_url"),
  status: text("status").notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSocialAccountSchema = createInsertSchema(socialAccounts).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type InsertSocialAccount = typeof socialAccounts.$inferInsert;
export type SocialAccount = typeof socialAccounts.$inferSelect;

export const insertSocialPostSchema = createInsertSchema(socialPosts).omit({ id: true, createdAt: true } as any);
export type InsertSocialPost = typeof socialPosts.$inferInsert;
export type SocialPost = typeof socialPosts.$inferSelect;

export const promotionScores = pgTable("promotion_scores", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  contentType: text("content_type").notNull(),
  contentId: text("content_id").notNull(),
  engagementVelocity: real("engagement_velocity").notNull().default(0),
  trustScore: real("trust_score").notNull().default(0),
  commentQuality: real("comment_quality").notNull().default(0),
  noveltyScore: real("novelty_score").notNull().default(0),
  debateActivity: real("debate_activity").notNull().default(0),
  trendScore: real("trend_score").notNull().default(0),
  totalScore: real("total_score").notNull().default(0),
  decision: text("decision").notNull().default("no_promotion"),
  reasoning: text("reasoning"),
  selectedPlatforms: text("selected_platforms").array(),
  scheduledAt: timestamp("scheduled_at"),
  promotedAt: timestamp("promoted_at"),
  overriddenBy: text("overridden_by"),
  overrideDecision: text("override_decision"),
  status: text("status").notNull().default("pending"),
  evaluatedAt: timestamp("evaluated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPromotionScoreSchema = createInsertSchema(promotionScores).omit({ id: true, createdAt: true } as any);
export type InsertPromotionScore = typeof promotionScores.$inferInsert;
export type PromotionScore = typeof promotionScores.$inferSelect;

export const socialPerformance = pgTable("social_performance", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  socialPostId: integer("social_post_id"),
  platform: text("platform").notNull(),
  contentType: text("content_type").notNull(),
  contentId: text("content_id").notNull(),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  followerGains: integer("follower_gains").notNull().default(0),
  viralScore: real("viral_score").notNull().default(0),
  captionLength: integer("caption_length").default(0),
  hashtagCount: integer("hashtag_count").default(0),
  postedHour: integer("posted_hour"),
  postedDayOfWeek: integer("posted_day_of_week"),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSocialPerformanceSchema = createInsertSchema(socialPerformance).omit({ id: true, createdAt: true } as any);
export type InsertSocialPerformance = typeof socialPerformance.$inferInsert;
export type SocialPerformance = typeof socialPerformance.$inferSelect;

export const growthPatterns = pgTable("growth_patterns", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  patternType: text("pattern_type").notNull(),
  platform: text("platform").notNull(),
  insight: text("insight").notNull(),
  confidence: real("confidence").notNull().default(0),
  sampleSize: integer("sample_size").notNull().default(0),
  optimalPostingHour: integer("optimal_posting_hour"),
  optimalDayOfWeek: integer("optimal_day_of_week"),
  optimalCaptionLength: integer("optimal_caption_length"),
  optimalHashtagCount: integer("optimal_hashtag_count"),
  avgViralScore: real("avg_viral_score").default(0),
  topContentTypes: text("top_content_types").array(),
  weights: jsonb("weights"),
  predictionAccuracy: real("prediction_accuracy").default(0),
  isActive: boolean("is_active").notNull().default(true),
  learnedAt: timestamp("learned_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGrowthPatternSchema = createInsertSchema(growthPatterns).omit({ id: true, createdAt: true } as any);
export type InsertGrowthPattern = typeof growthPatterns.$inferInsert;
export type GrowthPattern = typeof growthPatterns.$inferSelect;

export const systemControlConfig = pgTable("system_control_config", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull().unique(),
  value: real("value").notNull().default(0.5),
  label: text("label").notNull(),
  description: text("description"),
  minValue: real("min_value").notNull().default(0),
  maxValue: real("max_value").notNull().default(1),
  step: real("step").notNull().default(0.1),
  category: text("category").notNull().default("general"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSystemControlConfigSchema = createInsertSchema(systemControlConfig).omit({ id: true, createdAt: true } as any);
export type InsertSystemControlConfig = typeof systemControlConfig.$inferInsert;
export type SystemControlConfig = typeof systemControlConfig.$inferSelect;

export const activityMetrics = pgTable("activity_metrics", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  metricKey: text("metric_key").notNull(),
  value: real("value").notNull(),
  window: text("window").notNull().default("5m"),
  observedAt: timestamp("observed_at").notNull().defaultNow(),
});

export const insertActivityMetricSchema = createInsertSchema(activityMetrics).omit({ id: true } as any);
export type InsertActivityMetric = typeof activityMetrics.$inferInsert;
export type ActivityMetric = typeof activityMetrics.$inferSelect;

export const anomalyEvents = pgTable("anomaly_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  metricKey: text("metric_key").notNull(),
  severity: text("severity").notNull().default("LOW"),
  deviationScore: real("deviation_score").notNull(),
  baselineValue: real("baseline_value").notNull(),
  currentValue: real("current_value").notNull(),
  message: text("message"),
  status: text("status").notNull().default("open"),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertAnomalyEventSchema = createInsertSchema(anomalyEvents).omit({ id: true } as any);
export type InsertAnomalyEvent = typeof anomalyEvents.$inferInsert;
export type AnomalyEvent = typeof anomalyEvents.$inferSelect;

export const automationDecisions = pgTable("automation_decisions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  actionKey: text("action_key").notNull(),
  context: text("context"),
  aiRecommendation: text("ai_recommendation"),
  anomalyId: integer("anomaly_id"),
  status: text("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
});

export const insertAutomationDecisionSchema = createInsertSchema(automationDecisions).omit({ id: true } as any);
export type InsertAutomationDecision = typeof automationDecisions.$inferInsert;
export type AutomationDecision = typeof automationDecisions.$inferSelect;

export const automationPolicy = pgTable("automation_policy", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  mode: text("mode").notNull().default("autopilot"),
  safeMode: boolean("safe_mode").notNull().default(false),
  killSwitch: boolean("kill_switch").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAutomationPolicySchema = createInsertSchema(automationPolicy).omit({ id: true } as any);
export type InsertAutomationPolicy = typeof automationPolicy.$inferInsert;
export type AutomationPolicy = typeof automationPolicy.$inferSelect;

export const safeModeControls = pgTable("safe_mode_controls", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  globalSafeMode: boolean("global_safe_mode").notNull().default(false),
  pauseAutonomousPublishing: boolean("pause_autonomous_publishing").notNull().default(false),
  pauseMarketplaceApprovals: boolean("pause_marketplace_approvals").notNull().default(false),
  pauseExternalAgentActions: boolean("pause_external_agent_actions").notNull().default(false),
  pauseSocialDistributionAutomation: boolean("pause_social_distribution_automation").notNull().default(false),
  pauseYouTubeUploads: boolean("pause_youtube_uploads").notNull().default(false),
  pausePodcastAudioGeneration: boolean("pause_podcast_audio_generation").notNull().default(false),
  maintenanceBannerEnabled: boolean("maintenance_banner_enabled").notNull().default(false),
  maintenanceBannerMessage: text("maintenance_banner_message"),
  updatedBy: text("updated_by"),
  lastReason: text("last_reason").notNull().default("Initial safe-mode control state"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSafeModeControlsSchema = createInsertSchema(safeModeControls).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type InsertSafeModeControls = typeof safeModeControls.$inferInsert;
export type SafeModeControls = typeof safeModeControls.$inferSelect;

// ---- MONETIZATION SYSTEM ----

export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  priceMonthly: integer("price_monthly").notNull().default(0),
  priceYearly: integer("price_yearly").notNull().default(0),
  creditsPerMonth: integer("credits_per_month").notNull().default(0),
  features: jsonb("features").notNull().default([]),
  debateDiscount: integer("debate_discount").notNull().default(0),
  maxDebatesPerMonth: integer("max_debates_per_month").notNull().default(1),
  aiResponsesPerDay: integer("ai_responses_per_day").notNull().default(5),
  prioritySupport: boolean("priority_support").notNull().default(false),
  badgeLabel: text("badge_label"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  stripePriceIdMonthly: text("stripe_price_id_monthly"),
  stripePriceIdYearly: text("stripe_price_id_yearly"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userSubscriptions = pgTable("user_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  planId: varchar("plan_id").notNull(),
  status: text("status").notNull().default("active"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCustomerId: text("stripe_customer_id"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const creditPackages = pgTable("credit_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  credits: integer("credits").notNull(),
  priceUsd: integer("price_usd").notNull(),
  bonusCredits: integer("bonus_credits").notNull().default(0),
  popular: boolean("popular").notNull().default(false),
  stripePriceId: text("stripe_price_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const creditPurchases = pgTable("credit_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  packageId: varchar("package_id"),
  creditsBought: integer("credits_bought").notNull(),
  amountPaid: integer("amount_paid").notNull(),
  paymentMethod: text("payment_method").notNull().default("stripe"),
  stripePaymentId: text("stripe_payment_id"),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  invoiceNumber: text("invoice_number").notNull(),
  type: text("type").notNull().default("credit_purchase"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull().default("paid"),
  items: jsonb("items").notNull().default([]),
  stripeInvoiceId: text("stripe_invoice_id"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const creditUsageLog = pgTable("credit_usage_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  creditsUsed: integer("credits_used").notNull(),
  actionType: text("action_type").notNull(),
  actionLabel: text("action_label"),
  referenceId: varchar("reference_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({ id: true, createdAt: true });
export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCreditPackageSchema = createInsertSchema(creditPackages).omit({ id: true, createdAt: true });
export const insertCreditPurchaseSchema = createInsertSchema(creditPurchases).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertCreditUsageLogSchema = createInsertSchema(creditUsageLog).omit({ id: true, createdAt: true });

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type InsertUserSubscription = z.infer<typeof insertUserSubscriptionSchema>;
export type CreditPackage = typeof creditPackages.$inferSelect;
export type InsertCreditPackage = z.infer<typeof insertCreditPackageSchema>;
export type CreditPurchase = typeof creditPurchases.$inferSelect;
export type InsertCreditPurchase = z.infer<typeof insertCreditPurchaseSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type CreditUsageLog = typeof creditUsageLog.$inferSelect;
export type InsertCreditUsageLog = z.infer<typeof insertCreditUsageLogSchema>;

export const flywheelMetrics = pgTable("flywheel_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  contentCount: integer("content_count").notNull().default(0),
  trafficCount: integer("traffic_count").notNull().default(0),
  userCount: integer("user_count").notNull().default(0),
  revenueCents: integer("revenue_cents").notNull().default(0),
  costCents: integer("cost_cents").notNull().default(0),
  velocityScore: integer("velocity_score").notNull().default(0),
  insights: jsonb("insights").notNull().default([]),
});

export const insertFlywheelMetricSchema = createInsertSchema(flywheelMetrics).omit({ id: true, timestamp: true });
export type FlywheelMetric = typeof flywheelMetrics.$inferSelect;
export type InsertFlywheelMetric = z.infer<typeof insertFlywheelMetricSchema>;

export const moderationLogs = pgTable("moderation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  contentType: text("content_type").notNull(),
  contentId: varchar("content_id"),
  contentSnippet: text("content_snippet"),
  reason: text("reason").notNull(),
  category: text("category").notNull(),
  actionTaken: text("action_taken").notNull(),
  severity: text("severity").notNull().default("medium"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertModerationLogSchema = createInsertSchema(moderationLogs).omit({ id: true, timestamp: true });
export type ModerationLog = typeof moderationLogs.$inferSelect;
export type InsertModerationLog = z.infer<typeof insertModerationLogSchema>;

// ---- SEO & AI KNOWLEDGE TABLES ----
export const topicAuthority = pgTable("topic_authority", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topicSlug: text("topic_slug").notNull().unique(),
  authorityScore: real("authority_score").notNull().default(0),
  contentVolume: integer("content_volume").notNull().default(0),
  engagementQuality: real("engagement_quality").notNull().default(0),
  verificationAvg: real("verification_avg").notNull().default(0),
  citationFrequency: integer("citation_frequency").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const civilizationMetrics = pgTable("civilization_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  healthScore: real("health_score").notNull().default(0),
  verifiedEntries: integer("verified_entries").notNull().default(0),
  consensusUpdates: integer("consensus_updates").notNull().default(0),
  summaryRevisions: integer("summary_revisions").notNull().default(0),
  expertUserCount: integer("expert_user_count").notNull().default(0),
  specializedAgentCount: integer("specialized_agent_count").notNull().default(0),
  economyStats: jsonb("economy_stats").notNull().default({}),
  governanceStats: jsonb("governance_stats").notNull().default({}),
  evolutionStats: jsonb("evolution_stats").notNull().default({}),
  knowledgeScore: real("knowledge_score"),
  institutionScore: real("institution_score"),
  economyScore: real("economy_score"),
  governanceScore: real("governance_score"),
  evolutionScore: real("evolution_score"),
  maturityLevel: text("maturity_level"),
  trendDelta: real("trend_delta"),
  aiInsights: text("ai_insights"),
  recordedAt: timestamp("recorded_at").defaultNow(),
});

export const networkGravity = pgTable("network_gravity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gravityScore: real("gravity_score").notNull().default(0),
  replyLatency: real("reply_latency"),
  topicRecurrenceRate: real("topic_recurrence_rate"),
  aiParticipationRatio: real("ai_participation_ratio"),
  externalTrafficShare: real("external_traffic_share"),
  creatorRetention: real("creator_retention"),
  growthDirection: text("growth_direction"),
  trendDelta: real("trend_delta"),
  selfSustainingScore: real("self_sustaining_score"),
  componentBreakdown: jsonb("component_breakdown").$type<Record<string, number>>(),
  aiInsights: text("ai_insights"),
  recordedAt: timestamp("recorded_at").defaultNow(),
});

export const insertTopicAuthoritySchema = createInsertSchema(topicAuthority).omit({ id: true, updatedAt: true });
export const insertCivilizationMetricsSchema = createInsertSchema(civilizationMetrics).omit({ id: true, recordedAt: true });
export const insertNetworkGravitySchema = createInsertSchema(networkGravity).omit({ id: true, recordedAt: true });

export type TopicAuthority = typeof topicAuthority.$inferSelect;
export type InsertTopicAuthority = z.infer<typeof insertTopicAuthoritySchema>;
export type CivilizationMetric = typeof civilizationMetrics.$inferSelect;
export type InsertCivilizationMetric = z.infer<typeof insertCivilizationMetricsSchema>;
export type NetworkGravityRecord = typeof networkGravity.$inferSelect;
export type InsertNetworkGravity = z.infer<typeof insertNetworkGravitySchema>;

// ---- USER-OWNED AI AGENT PLATFORM ----

export const userAgents = pgTable("user_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(),
  type: text("type").notNull().default("business"),
  agentType: text("agent_type").notNull().default("business"),
  name: text("name").notNull(),
  persona: text("persona"),
  skills: text("skills").array(),
  avatarUrl: text("avatar_url"),
  voiceId: text("voice_id"),
  model: text("model").notNull().default("gpt-4o"),
  provider: text("provider").notNull().default("openai"),
  systemPrompt: text("system_prompt"),
  temperature: real("temperature").notNull().default(0.7),
  visibility: text("visibility").notNull().default("private"),
  marketplaceEnabled: boolean("marketplace_enabled").notNull().default(false),
  exportable: boolean("exportable").notNull().default(true),
  exportVersion: integer("export_version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  deploymentModes: text("deployment_modes").array().notNull().default(sql`ARRAY['private']::text[]`),
  rateLimitPerMin: integer("rate_limit_per_min").notNull().default(30),
  totalUsageCount: integer("total_usage_count").notNull().default(0),
  totalCreditsEarned: integer("total_credits_earned").notNull().default(0),
  rating: real("rating").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  tags: text("tags").array(),
  industrySlug: text("industry_slug"),
  categorySlug: text("category_slug"),
  roleSlug: text("role_slug"),
  trustScore: real("trust_score").notNull().default(50),
  qualityScore: real("quality_score").notNull().default(0),
  version: text("version").notNull().default("1.0.0"),
  changelog: text("changelog"),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  specializationSlug: text("specialization_slug"),
  weeklyUsageCount: integer("weekly_usage_count").notNull().default(0),
  monthlyUsageCount: integer("monthly_usage_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const agentKnowledgeSources = pgTable("agent_knowledge_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  vaultType: text("vault_type").notNull().default("business"),
  sensitivity: text("sensitivity").notNull().default("restricted"),
  sourceType: text("source_type").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  uri: text("uri"),
  metadata: jsonb("metadata").default({}),
  status: text("status").notNull().default("pending"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const marketplaceListings = pgTable("marketplace_listings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  sellerId: varchar("seller_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  longDescription: text("long_description"),
  pricingModel: text("pricing_model").notNull().default("one_time"),
  priceCredits: integer("price_credits").notNull().default(100),
  monthlyCredits: integer("monthly_credits"),
  perUseCredits: integer("per_use_credits"),
  revenueSplit: real("revenue_split").notNull().default(0.7),
  category: text("category"),
  featured: boolean("featured").notNull().default(false),
  demoEnabled: boolean("demo_enabled").notNull().default(false),
  demoPrompt: text("demo_prompt"),
  totalSales: integer("total_sales").notNull().default(0),
  totalRevenue: integer("total_revenue").notNull().default(0),
  averageRating: real("average_rating").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const agentMarketplaceClonePackages = pgTable("agent_marketplace_clone_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceAgentId: varchar("source_agent_id").notNull(),
  creatorUserId: varchar("creator_user_id").notNull(),
  marketplaceListingId: varchar("marketplace_listing_id"),
  exportMode: text("export_mode").notNull(),
  status: text("status").notNull().default("draft"),
  packageMetadata: jsonb("package_metadata").default({}),
  includedVaultSummary: jsonb("included_vault_summary").default({}),
  excludedVaultSummary: jsonb("excluded_vault_summary").default({}),
  safetyReport: jsonb("safety_report").default({}),
  sanitizerReport: jsonb("sanitizer_report").default({}),
  sandboxConfig: jsonb("sandbox_config").default({}),
  trustSignals: jsonb("trust_signals").default({}),
  reviewStatus: text("review_status").notNull().default("draft"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const knowledgePackets = pgTable("knowledge_packets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorAgentId: varchar("creator_agent_id").notNull(),
  creatorUserId: varchar("creator_user_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  abstractedContent: text("abstracted_content").notNull(),
  sourceType: text("source_type").notNull(),
  domainTags: text("domain_tags").array().notNull().default(sql`ARRAY[]::text[]`),
  industryTags: text("industry_tags").array().notNull().default(sql`ARRAY[]::text[]`),
  geoTags: text("geo_tags").array().notNull().default(sql`ARRAY[]::text[]`),
  professionTags: text("profession_tags").array().notNull().default(sql`ARRAY[]::text[]`),
  vaultType: text("vault_type").notNull().default("business"),
  sensitivity: text("sensitivity").notNull().default("restricted"),
  privacyLevel: text("privacy_level").notNull().default("internal"),
  consentPolicy: jsonb("consent_policy").$type<Record<string, any>>().notNull().default({}),
  safetyReport: jsonb("safety_report").$type<Record<string, any>>().notNull().default({}),
  sourceFingerprint: text("source_fingerprint").notNull(),
  evidenceStrength: real("evidence_strength").notNull().default(0),
  noveltyScore: real("novelty_score").notNull().default(0),
  usefulnessPrediction: real("usefulness_prediction").notNull().default(0),
  riskScore: real("risk_score").notNull().default(1),
  complianceScore: real("compliance_score").notNull().default(0),
  freshnessTimestamp: timestamp("freshness_timestamp").defaultNow(),
  halfLifeDays: integer("half_life_days").notNull().default(90),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  reviewStatus: text("review_status").notNull().default("draft"),
  status: text("status").notNull().default("draft"),
  acceptedByAgents: integer("accepted_by_agents").notNull().default(0),
  rejectedByAgents: integer("rejected_by_agents").notNull().default(0),
  challengedByAgents: integer("challenged_by_agents").notNull().default(0),
  downstreamUsageCount: integer("downstream_usage_count").notNull().default(0),
  weightedAcceptance: real("weighted_acceptance").notNull().default(0),
  gluonEarned: real("gluon_earned").notNull().default(0),
  parentPacketIds: text("parent_packet_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  derivedPacketIds: text("derived_packet_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("knowledge_packets_creator_user_idx").on(table.creatorUserId),
  index("knowledge_packets_creator_agent_idx").on(table.creatorAgentId),
  index("knowledge_packets_fingerprint_idx").on(table.sourceFingerprint),
]);

export const knowledgePacketAcceptances = pgTable("knowledge_packet_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packetId: varchar("packet_id").notNull(),
  acceptingAgentId: varchar("accepting_agent_id").notNull(),
  acceptingAgentType: text("accepting_agent_type").notNull(),
  acceptingUserId: varchar("accepting_user_id"),
  decision: text("decision").notNull(),
  domainMatch: real("domain_match").notNull().default(0),
  receiverAuthority: real("receiver_authority").notNull().default(0),
  retentionScore: real("retention_score").notNull().default(0),
  realWorldFeedbackScore: real("real_world_feedback_score").notNull().default(0),
  weightedAcceptanceContribution: real("weighted_acceptance_contribution").notNull().default(0),
  trustInputs: jsonb("trust_inputs").$type<Record<string, any>>().notNull().default({}),
  uesInputs: jsonb("ues_inputs").$type<Record<string, any>>().notNull().default({}),
  rationale: text("rationale"),
  challengeReason: text("challenge_reason"),
  sandboxOnly: boolean("sandbox_only").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("knowledge_packet_acceptances_packet_acceptor_unique").on(table.packetId, table.acceptingAgentId, table.acceptingAgentType),
  index("knowledge_packet_acceptances_packet_idx").on(table.packetId),
]);

export const gluonLedgerEntries = pgTable("gluon_ledger_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packetId: varchar("packet_id").notNull(),
  agentId: varchar("agent_id"),
  userId: varchar("user_id"),
  eventType: text("event_type").notNull(),
  amount: real("amount").notNull().default(0),
  calculationInputs: jsonb("calculation_inputs").$type<Record<string, any>>().notNull().default({}),
  status: text("status").notNull().default("simulated"),
  nonConvertible: boolean("non_convertible").notNull().default(true),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("gluon_ledger_packet_idx").on(table.packetId),
  index("gluon_ledger_agent_idx").on(table.agentId),
  index("gluon_ledger_user_idx").on(table.userId),
]);

export const gluonValueBaselines = pgTable("gluon_value_baselines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  componentKey: text("component_key").notNull(),
  baselineValue: real("baseline_value").notNull(),
  source: text("source").notNull().default("manual"),
  effectiveDate: timestamp("effective_date").defaultNow(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("gluon_value_baselines_component_idx").on(table.componentKey),
  index("gluon_value_baselines_active_idx").on(table.active),
]);

export const gluonValueIndexSnapshots = pgTable("gluon_value_index_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  componentValues: jsonb("component_values").$type<Record<string, any>>().notNull().default({}),
  componentIndexes: jsonb("component_indexes").$type<Record<string, any>>().notNull().default({}),
  weights: jsonb("weights").$type<Record<string, any>>().notNull().default({}),
  gviScore: real("gvi_score").notNull(),
  sourceMetadata: jsonb("source_metadata").$type<Record<string, any>>().notNull().default({}),
  fallbackUsed: boolean("fallback_used").notNull().default(true),
  stale: boolean("stale").notNull().default(true),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("gluon_value_index_snapshots_created_at_idx").on(table.createdAt),
]);

export const gluonRedemptionEligibilityReviews = pgTable("gluon_redemption_eligibility_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  agentId: varchar("agent_id"),
  validGluon: real("valid_gluon").notNull().default(0),
  invalidGluon: real("invalid_gluon").notNull().default(0),
  pendingGluon: real("pending_gluon").notNull().default(0),
  latestGviSnapshotId: varchar("latest_gvi_snapshot_id"),
  informationalEstimate: real("informational_estimate").notNull().default(0),
  platformConversionRate: real("platform_conversion_rate").notNull().default(0),
  eligibilityStatus: text("eligibility_status").notNull().default("disabled"),
  complianceChecklist: jsonb("compliance_checklist").$type<Record<string, any>>().notNull().default({}),
  fraudSignals: jsonb("fraud_signals").$type<Record<string, any>>().notNull().default({}),
  sourceSummary: jsonb("source_summary").$type<Record<string, any>>().notNull().default({}),
  adminReviewStatus: text("admin_review_status").notNull().default("pending"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("gluon_redemption_reviews_user_idx").on(table.userId),
  index("gluon_redemption_reviews_agent_idx").on(table.agentId),
  index("gluon_redemption_reviews_status_idx").on(table.adminReviewStatus),
  index("gluon_redemption_reviews_created_at_idx").on(table.createdAt),
]);

export const agentDnaMutationHistory = pgTable("agent_dna_mutation_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  packetId: varchar("packet_id").notNull(),
  mutationType: text("mutation_type").notNull(),
  beforeDna: jsonb("before_dna").$type<Record<string, any>>().notNull().default({}),
  afterDna: jsonb("after_dna").$type<Record<string, any>>().notNull().default({}),
  scoreInputs: jsonb("score_inputs").$type<Record<string, any>>().notNull().default({}),
  status: text("status").notNull().default("preview"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("agent_dna_mutation_history_agent_idx").on(table.agentId),
  index("agent_dna_mutation_history_packet_idx").on(table.packetId),
]);

export const agentPurchases = pgTable("agent_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  buyerId: varchar("buyer_id").notNull(),
  listingId: varchar("listing_id").notNull(),
  agentId: varchar("agent_id").notNull(),
  sellerId: varchar("seller_id").notNull(),
  creditsPaid: integer("credits_paid").notNull(),
  sellerEarnings: integer("seller_earnings").notNull(),
  platformFee: integer("platform_fee").notNull(),
  purchaseType: text("purchase_type").notNull().default("one_time"),
  status: text("status").notNull().default("active"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentUsageLogs = pgTable("agent_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  userId: varchar("user_id").notNull(),
  actionType: text("action_type").notNull(),
  creditsSpent: integer("credits_spent").notNull().default(0),
  tokensUsed: integer("tokens_used"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentReviews = pgTable("agent_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  listingId: varchar("listing_id").notNull(),
  clonePackageId: varchar("clone_package_id"),
  reviewerId: varchar("reviewer_id").notNull(),
  rating: integer("rating").notNull(),
  title: text("title"),
  content: text("content"),
  helpful: integer("helpful").notNull().default(0),
  moderationStatus: text("moderation_status").notNull().default("pending_review"),
  sandboxOnly: boolean("sandbox_only").notNull().default(true),
  safetyReport: jsonb("safety_report").$type<Record<string, any>>().notNull().default({}),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const agentVersions = pgTable("agent_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  version: text("version").notNull(),
  changelog: text("changelog"),
  systemPrompt: text("system_prompt"),
  model: text("model"),
  temperature: real("temperature"),
  skills: text("skills").array(),
  publishedBy: varchar("published_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ---- INDUSTRY SPECIALIZATION SYSTEM ----

export const industries = pgTable("industries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("Briefcase"),
  description: text("description"),
  color: text("color").notNull().default("#6366f1"),
  regulated: boolean("regulated").notNull().default(false),
  disclaimer: text("disclaimer"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const industryCategories = pgTable("industry_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  industrySlug: text("industry_slug").notNull(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentRoles = pgTable("agent_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categorySlug: text("category_slug").notNull(),
  industrySlug: text("industry_slug").notNull(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  systemPromptTemplate: text("system_prompt_template"),
  defaultSkills: text("default_skills").array(),
  defaultTemperature: real("default_temperature").default(0.7),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const knowledgePacks = pgTable("knowledge_packs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  industrySlug: text("industry_slug").notNull(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  contentSummary: text("content_summary"),
  sourceCount: integer("source_count").notNull().default(0),
  creditCost: integer("credit_cost").notNull().default(0),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentSpecializations = pgTable("agent_specializations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  industrySlug: text("industry_slug").notNull(),
  categorySlug: text("category_slug"),
  roleSlug: text("role_slug"),
  knowledgePackIds: text("knowledge_pack_ids").array(),
  complianceDisclaimer: text("compliance_disclaimer"),
  industrySystemPrompt: text("industry_system_prompt"),
  customSkills: text("custom_skills").array(),
  behaviorProfile: jsonb("behavior_profile").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertIndustrySchema = createInsertSchema(industries).omit({ id: true, createdAt: true });
export const insertIndustryCategorySchema = createInsertSchema(industryCategories).omit({ id: true, createdAt: true });
export const insertAgentRoleSchema = createInsertSchema(agentRoles).omit({ id: true, createdAt: true });
export const insertKnowledgePackSchema = createInsertSchema(knowledgePacks).omit({ id: true, createdAt: true });
export const insertAgentSpecializationSchema = createInsertSchema(agentSpecializations).omit({ id: true, createdAt: true });

export type Industry = typeof industries.$inferSelect;
export type InsertIndustry = z.infer<typeof insertIndustrySchema>;
export type IndustryCategory = typeof industryCategories.$inferSelect;
export type InsertIndustryCategory = z.infer<typeof insertIndustryCategorySchema>;
export type AgentRole = typeof agentRoles.$inferSelect;
export type InsertAgentRole = z.infer<typeof insertAgentRoleSchema>;
export type KnowledgePack = typeof knowledgePacks.$inferSelect;
export type InsertKnowledgePack = z.infer<typeof insertKnowledgePackSchema>;
export type AgentSpecialization = typeof agentSpecializations.$inferSelect;
export type InsertAgentSpecialization = z.infer<typeof insertAgentSpecializationSchema>;

export const agentCostLogs = pgTable("agent_cost_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  ownerId: varchar("owner_id").notNull(),
  actionType: text("action_type").notNull(),
  creditsCharged: integer("credits_charged").notNull(),
  tokensUsed: integer("tokens_used"),
  model: text("model"),
  status: text("status").notNull().default("completed"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

// ---- AGENT SKILL TREE & PROGRESSION ----

export const agentSkillNodes = pgTable("agent_skill_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  industrySlug: text("industry_slug").notNull(),
  treeTier: integer("tree_tier").notNull().default(1),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon").notNull().default("Zap"),
  xpCost: integer("xp_cost").notNull().default(100),
  creditCost: integer("credit_cost").notNull().default(0),
  levelRequired: integer("level_required").notNull().default(1),
  prerequisiteSlugs: text("prerequisite_slugs").array(),
  effectType: text("effect_type").notNull().default("boost"),
  effectKey: text("effect_key"),
  effectValue: real("effect_value"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentUnlockedSkills = pgTable("agent_unlocked_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  skillSlug: text("skill_slug").notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow(),
});

export const agentXpLogs = pgTable("agent_xp_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  source: text("source").notNull(),
  xpAmount: integer("xp_amount").notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentCertifications = pgTable("agent_certifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  industrySlug: text("industry_slug").notNull(),
  certSlug: text("cert_slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  badge: text("badge").notNull().default("verified"),
  rankBoost: integer("rank_boost").notNull().default(10),
  grantedAt: timestamp("granted_at").defaultNow(),
});

export const insertAgentSkillNodeSchema = createInsertSchema(agentSkillNodes).omit({ id: true, createdAt: true });
export const insertAgentUnlockedSkillSchema = createInsertSchema(agentUnlockedSkills).omit({ id: true, unlockedAt: true });
export const insertAgentXpLogSchema = createInsertSchema(agentXpLogs).omit({ id: true, createdAt: true });
export const insertAgentCertificationSchema = createInsertSchema(agentCertifications).omit({ id: true, grantedAt: true });

export type AgentSkillNode = typeof agentSkillNodes.$inferSelect;
export type InsertAgentSkillNode = z.infer<typeof insertAgentSkillNodeSchema>;
export type AgentUnlockedSkill = typeof agentUnlockedSkills.$inferSelect;
export type AgentXpLog = typeof agentXpLogs.$inferSelect;
export type AgentCertification = typeof agentCertifications.$inferSelect;

export const agentTrustProfiles = pgTable("agent_trust_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  accuracyScore: real("accuracy_score").notNull().default(50),
  communityScore: real("community_score").notNull().default(50),
  expertiseScore: real("expertise_score").notNull().default(50),
  safetyScore: real("safety_score").notNull().default(50),
  networkInfluenceScore: real("network_influence_score").notNull().default(0),
  compositeTrustScore: real("composite_trust_score").notNull().default(50),
  trustTier: text("trust_tier").notNull().default("unverified"),
  totalEvents: integer("total_events").notNull().default(0),
  manipulationFlags: integer("manipulation_flags").notNull().default(0),
  isSuspended: boolean("is_suspended").notNull().default(false),
  suspensionReason: text("suspension_reason"),
  lastCalculatedAt: timestamp("last_calculated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentTrustEvents = pgTable("agent_trust_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  eventType: text("event_type").notNull(),
  component: text("component").notNull(),
  delta: real("delta").notNull().default(0),
  sourceId: varchar("source_id"),
  sourceUserId: varchar("source_user_id"),
  metadata: jsonb("metadata"),
  flagged: boolean("flagged").notNull().default(false),
  flagReason: text("flag_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentTrustHistory = pgTable("agent_trust_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  accuracyScore: real("accuracy_score").notNull(),
  communityScore: real("community_score").notNull(),
  expertiseScore: real("expertise_score").notNull(),
  safetyScore: real("safety_score").notNull(),
  networkInfluenceScore: real("network_influence_score").notNull(),
  compositeTrustScore: real("composite_trust_score").notNull(),
  trustTier: text("trust_tier").notNull(),
  snapshotAt: timestamp("snapshot_at").defaultNow(),
});

export const insertAgentTrustProfileSchema = createInsertSchema(agentTrustProfiles).omit({ id: true, createdAt: true, lastCalculatedAt: true });
export const insertAgentTrustEventSchema = createInsertSchema(agentTrustEvents).omit({ id: true, createdAt: true });
export const insertAgentTrustHistorySchema = createInsertSchema(agentTrustHistory).omit({ id: true, snapshotAt: true });

export type AgentTrustProfile = typeof agentTrustProfiles.$inferSelect;
export type AgentTrustEvent = typeof agentTrustEvents.$inferSelect;
export type AgentTrustHistory = typeof agentTrustHistory.$inferSelect;

export const insertUserAgentSchema = createInsertSchema(userAgents).omit({ id: true, createdAt: true, updatedAt: true, totalUsageCount: true, totalCreditsEarned: true, rating: true, ratingCount: true, trustScore: true, qualityScore: true, weeklyUsageCount: true, monthlyUsageCount: true, xp: true, level: true });
export const insertAgentKnowledgeSourceSchema = createInsertSchema(agentKnowledgeSources).omit({ id: true, createdAt: true, processedAt: true });
export const insertMarketplaceListingSchema = createInsertSchema(marketplaceListings).omit({ id: true, createdAt: true, updatedAt: true, totalSales: true, totalRevenue: true, averageRating: true, reviewCount: true });
export const insertAgentMarketplaceClonePackageSchema = createInsertSchema(agentMarketplaceClonePackages).omit({ id: true, createdAt: true, updatedAt: true });
export const insertKnowledgePacketSchema = createInsertSchema(knowledgePackets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertKnowledgePacketAcceptanceSchema = createInsertSchema(knowledgePacketAcceptances).omit({ id: true, createdAt: true });
export const insertGluonLedgerEntrySchema = createInsertSchema(gluonLedgerEntries).omit({ id: true, createdAt: true });
export const insertGluonValueBaselineSchema = createInsertSchema(gluonValueBaselines).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGluonValueIndexSnapshotSchema = createInsertSchema(gluonValueIndexSnapshots).omit({ id: true, createdAt: true });
export const insertGluonRedemptionEligibilityReviewSchema = createInsertSchema(gluonRedemptionEligibilityReviews).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAgentDnaMutationHistorySchema = createInsertSchema(agentDnaMutationHistory).omit({ id: true, createdAt: true });
export const insertAgentPurchaseSchema = createInsertSchema(agentPurchases).omit({ id: true, createdAt: true });
export const insertAgentUsageLogSchema = createInsertSchema(agentUsageLogs).omit({ id: true, createdAt: true });
export const insertAgentReviewSchema = createInsertSchema(agentReviews).omit({ id: true, createdAt: true, updatedAt: true, helpful: true });
export const insertAgentVersionSchema = createInsertSchema(agentVersions).omit({ id: true, createdAt: true });
export const insertAgentCostLogSchema = createInsertSchema(agentCostLogs).omit({ id: true, createdAt: true });

// ---- Autonomous Agent Collaboration (Teams) ----

export const agentTeams = pgTable("agent_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  taskDescription: text("task_description").notNull(),
  status: text("status").notNull().default("forming"),
  coordinatorId: varchar("coordinator_id"),
  maxAgents: integer("max_agents").notNull().default(6),
  maxRounds: integer("max_rounds").notNull().default(5),
  currentRound: integer("current_round").notNull().default(0),
  totalCreditsSpent: integer("total_credits_spent").notNull().default(0),
  totalCreditsRewarded: integer("total_credits_rewarded").notNull().default(0),
  qualityScore: real("quality_score"),
  validationStatus: text("validation_status").default("pending"),
  finalOutput: text("final_output"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  agentId: varchar("agent_id").notNull(),
  role: text("role").notNull(),
  selectionScore: real("selection_score").notNull().default(0),
  creditsEarned: integer("credits_earned").notNull().default(0),
  tasksCompleted: integer("tasks_completed").notNull().default(0),
  performanceRating: real("performance_rating"),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const teamTasks = pgTable("team_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  parentTaskId: varchar("parent_task_id"),
  assignedAgentId: varchar("assigned_agent_id"),
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type").notNull(),
  status: text("status").notNull().default("pending"),
  priority: integer("priority").notNull().default(0),
  round: integer("round").notNull().default(1),
  result: text("result"),
  confidence: real("confidence"),
  rewardValue: integer("reward_value").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const teamMessages = pgTable("team_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  taskId: varchar("task_id"),
  senderId: varchar("sender_id").notNull(),
  recipientId: varchar("recipient_id"),
  messageType: text("message_type").notNull(),
  content: text("content").notNull(),
  structuredData: jsonb("structured_data"),
  round: integer("round").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const teamWorkspaces = pgTable("team_workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  key: text("key").notNull(),
  value: text("value"),
  metadata: jsonb("metadata"),
  contributorId: varchar("contributor_id"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAgentTeamSchema = createInsertSchema(agentTeams).omit({ id: true, createdAt: true, completedAt: true });
export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, joinedAt: true });
export const insertTeamTaskSchema = createInsertSchema(teamTasks).omit({ id: true, createdAt: true, completedAt: true });
export const insertTeamMessageSchema = createInsertSchema(teamMessages).omit({ id: true, createdAt: true });
export const insertTeamWorkspaceSchema = createInsertSchema(teamWorkspaces).omit({ id: true, updatedAt: true });

export type AgentTeam = typeof agentTeams.$inferSelect;
export type InsertAgentTeam = z.infer<typeof insertAgentTeamSchema>;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamTask = typeof teamTasks.$inferSelect;
export type InsertTeamTask = z.infer<typeof insertTeamTaskSchema>;
export type TeamMessage = typeof teamMessages.$inferSelect;
export type InsertTeamMessage = z.infer<typeof insertTeamMessageSchema>;
export type TeamWorkspace = typeof teamWorkspaces.$inferSelect;
export type InsertTeamWorkspace = z.infer<typeof insertTeamWorkspaceSchema>;

export type UserAgent = typeof userAgents.$inferSelect;
export type InsertUserAgent = z.infer<typeof insertUserAgentSchema>;
export type AgentKnowledgeSource = typeof agentKnowledgeSources.$inferSelect;
export type InsertAgentKnowledgeSource = z.infer<typeof insertAgentKnowledgeSourceSchema>;
export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type InsertMarketplaceListing = z.infer<typeof insertMarketplaceListingSchema>;
export type AgentMarketplaceClonePackage = typeof agentMarketplaceClonePackages.$inferSelect;
export type InsertAgentMarketplaceClonePackage = z.infer<typeof insertAgentMarketplaceClonePackageSchema>;
export type KnowledgePacket = typeof knowledgePackets.$inferSelect;
export type InsertKnowledgePacket = typeof knowledgePackets.$inferInsert;
export type KnowledgePacketAcceptance = typeof knowledgePacketAcceptances.$inferSelect;
export type InsertKnowledgePacketAcceptance = typeof knowledgePacketAcceptances.$inferInsert;
export type GluonLedgerEntry = typeof gluonLedgerEntries.$inferSelect;
export type InsertGluonLedgerEntry = typeof gluonLedgerEntries.$inferInsert;
export type GluonValueBaseline = typeof gluonValueBaselines.$inferSelect;
export type InsertGluonValueBaseline = typeof gluonValueBaselines.$inferInsert;
export type GluonValueIndexSnapshot = typeof gluonValueIndexSnapshots.$inferSelect;
export type InsertGluonValueIndexSnapshot = typeof gluonValueIndexSnapshots.$inferInsert;
export type GluonRedemptionEligibilityReview = typeof gluonRedemptionEligibilityReviews.$inferSelect;
export type InsertGluonRedemptionEligibilityReview = typeof gluonRedemptionEligibilityReviews.$inferInsert;
export type AgentDnaMutationHistory = typeof agentDnaMutationHistory.$inferSelect;
export type InsertAgentDnaMutationHistory = typeof agentDnaMutationHistory.$inferInsert;
export type AgentPurchase = typeof agentPurchases.$inferSelect;
export type InsertAgentPurchase = z.infer<typeof insertAgentPurchaseSchema>;
export type AgentUsageLog = typeof agentUsageLogs.$inferSelect;
export type InsertAgentUsageLog = z.infer<typeof insertAgentUsageLogSchema>;
export type AgentReview = typeof agentReviews.$inferSelect;
export type InsertAgentReview = z.infer<typeof insertAgentReviewSchema>;
export type AgentVersion = typeof agentVersions.$inferSelect;
export type InsertAgentVersion = z.infer<typeof insertAgentVersionSchema>;
export type AgentCostLog = typeof agentCostLogs.$inferSelect;
export type InsertAgentCostLog = z.infer<typeof insertAgentCostLogSchema>;

// ---- CIVILIZATION STABILITY LAYER ----

export const agentComputeBudgets = pgTable("agent_compute_budgets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  dailyBudget: integer("daily_budget").notNull().default(100),
  usedToday: integer("used_today").notNull().default(0),
  resetAt: timestamp("reset_at").defaultNow(),
  throttleLevel: text("throttle_level").notNull().default("none"),
  lastThrottleAt: timestamp("last_throttle_at"),
});

export const agentVisibilityScores = pgTable("agent_visibility_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  score: real("score").notNull().default(1.0),
  tier: text("tier").notNull().default("normal"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  suppressionReason: text("suppression_reason"),
  isSuppressed: boolean("is_suppressed").notNull().default(false),
});

export const policyRules = pgTable("policy_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  scope: text("scope").notNull().default("agent"),
  conditionJson: jsonb("condition_json").notNull(),
  actionJson: jsonb("action_json").notNull(),
  severity: integer("severity").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const policyViolations = pgTable("policy_violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  ruleId: varchar("rule_id").notNull(),
  ruleName: text("rule_name"),
  status: text("status").notNull().default("active"),
  penaltyApplied: jsonb("penalty_applied"),
  detectedAt: timestamp("detected_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const creditSinks = pgTable("credit_sinks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  referenceId: varchar("reference_id"),
  agentId: varchar("agent_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const civilizationHealthSnapshots = pgTable("civilization_health_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  score: real("score").notNull(),
  trustDistribution: jsonb("trust_distribution"),
  spamRate: real("spam_rate").notNull().default(0),
  costBalance: real("cost_balance").notNull().default(0),
  collaborationSuccess: real("collaboration_success").notNull().default(0),
  agentCount: integer("agent_count").notNull().default(0),
  throttledCount: integer("throttled_count").notNull().default(0),
  suppressedCount: integer("suppressed_count").notNull().default(0),
  totalCreditSinks: integer("total_credit_sinks").notNull().default(0),
  violationCount: integer("violation_count").notNull().default(0),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentComputeBudgetSchema = createInsertSchema(agentComputeBudgets).omit({ id: true });
export const insertAgentVisibilityScoreSchema = createInsertSchema(agentVisibilityScores).omit({ id: true });
export const insertPolicyRuleSchema = createInsertSchema(policyRules).omit({ id: true, createdAt: true });
export const insertPolicyViolationSchema = createInsertSchema(policyViolations).omit({ id: true, detectedAt: true });
export const insertCreditSinkSchema = createInsertSchema(creditSinks).omit({ id: true, createdAt: true });
export const insertCivilizationHealthSnapshotSchema = createInsertSchema(civilizationHealthSnapshots).omit({ id: true, createdAt: true });

export type AgentComputeBudget = typeof agentComputeBudgets.$inferSelect;
export type InsertAgentComputeBudget = z.infer<typeof insertAgentComputeBudgetSchema>;
export type AgentVisibilityScore = typeof agentVisibilityScores.$inferSelect;
export type InsertAgentVisibilityScore = z.infer<typeof insertAgentVisibilityScoreSchema>;
export type PolicyRule = typeof policyRules.$inferSelect;
export type InsertPolicyRule = z.infer<typeof insertPolicyRuleSchema>;
export type PolicyViolation = typeof policyViolations.$inferSelect;
export type InsertPolicyViolation = z.infer<typeof insertPolicyViolationSchema>;
export type CreditSink = typeof creditSinks.$inferSelect;
export type InsertCreditSink = z.infer<typeof insertCreditSinkSchema>;
export type CivilizationHealthSnapshot = typeof civilizationHealthSnapshots.$inferSelect;
export type InsertCivilizationHealthSnapshot = z.infer<typeof insertCivilizationHealthSnapshotSchema>;

export const platformEvents = pgTable("platform_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  actorId: varchar("actor_id"),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: varchar("entity_id"),
  payload: jsonb("payload"),
  severity: varchar("severity", { length: 20 }).default("info"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentPassports = pgTable("agent_passports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  ownerId: varchar("owner_id").notNull(),
  exportVersion: integer("export_version").notNull().default(1),
  passportHash: varchar("passport_hash", { length: 128 }).notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentPassportExports = pgTable("agent_passport_exports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  ownerId: varchar("owner_id").notNull(),
  exportHash: varchar("export_hash", { length: 128 }).notNull(),
  exportVersion: integer("export_version").notNull().default(1),
  exportedAt: timestamp("exported_at").defaultNow(),
  revoked: boolean("revoked").notNull().default(false),
  revokedAt: timestamp("revoked_at"),
  revocationReason: text("revocation_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const flywheelAgents = pgTable("flywheel_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentType: varchar("agent_type", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  active: boolean("active").default(true),
  lastRunAt: timestamp("last_run_at"),
  lastResult: jsonb("last_result"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const flywheelRecommendations = pgTable("flywheel_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentType: varchar("agent_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  rationale: text("rationale"),
  impactArea: varchar("impact_area", { length: 50 }),
  severity: varchar("severity", { length: 20 }).default("medium"),
  priority: integer("priority").default(50),
  recommendedAction: jsonb("recommended_action"),
  status: varchar("status", { length: 20 }).default("pending"),
  appliedAt: timestamp("applied_at"),
  dismissedAt: timestamp("dismissed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const flywheelAutomationConfig = pgTable("flywheel_automation_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: varchar("mode", { length: 20 }).notNull().default("manual"),
  safeActions: jsonb("safe_actions").default([]),
  thresholds: jsonb("thresholds").default({}),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const flywheelOptimizationOutcomes = pgTable("flywheel_optimization_outcomes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recommendationId: varchar("recommendation_id").notNull(),
  actionTaken: text("action_taken"),
  outcomeMetrics: jsonb("outcome_metrics"),
  success: boolean("success"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlatformEventSchema = createInsertSchema(platformEvents).omit({ id: true, createdAt: true });
export const insertAgentPassportSchema = createInsertSchema(agentPassports).omit({ id: true, createdAt: true });
export const insertAgentPassportExportSchema = createInsertSchema(agentPassportExports).omit({ id: true, createdAt: true });
export const insertFlywheelAgentSchema = createInsertSchema(flywheelAgents).omit({ id: true, createdAt: true });
export const insertFlywheelRecommendationSchema = createInsertSchema(flywheelRecommendations).omit({ id: true, createdAt: true, appliedAt: true, dismissedAt: true });
export const insertFlywheelAutomationConfigSchema = createInsertSchema(flywheelAutomationConfig).omit({ id: true, lastUpdated: true });
export const insertFlywheelOptimizationOutcomeSchema = createInsertSchema(flywheelOptimizationOutcomes).omit({ id: true, createdAt: true });

export type PlatformEvent = typeof platformEvents.$inferSelect;
export type InsertPlatformEvent = z.infer<typeof insertPlatformEventSchema>;
export type AgentPassport = typeof agentPassports.$inferSelect;
export type InsertAgentPassport = z.infer<typeof insertAgentPassportSchema>;
export type AgentPassportExport = typeof agentPassportExports.$inferSelect;
export type InsertAgentPassportExport = z.infer<typeof insertAgentPassportExportSchema>;
export type FlywheelAgent = typeof flywheelAgents.$inferSelect;
export type InsertFlywheelAgent = z.infer<typeof insertFlywheelAgentSchema>;
export type FlywheelRecommendation = typeof flywheelRecommendations.$inferSelect;
export type InsertFlywheelRecommendation = z.infer<typeof insertFlywheelRecommendationSchema>;
export type FlywheelAutomationConfig = typeof flywheelAutomationConfig.$inferSelect;
export type InsertFlywheelAutomationConfig = z.infer<typeof insertFlywheelAutomationConfigSchema>;
export type FlywheelOptimizationOutcome = typeof flywheelOptimizationOutcomes.$inferSelect;
export type InsertFlywheelOptimizationOutcome = z.infer<typeof insertFlywheelOptimizationOutcomeSchema>;

// ============ Personal AI Agent System ============

export const personalAgentProfiles = pgTable("personal_agent_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  agentName: text("agent_name").notNull().default("My AI Assistant"),
  voicePreference: text("voice_preference").notNull().default("alloy"),
  dailyMessageLimit: integer("daily_message_limit").notNull().default(50),
  dailyMessagesUsed: integer("daily_messages_used").notNull().default(0),
  dailyVoiceLimit: integer("daily_voice_limit").notNull().default(10),
  dailyVoiceUsed: integer("daily_voice_used").notNull().default(0),
  lastResetDate: text("last_reset_date"),
  preferences: jsonb("preferences").default({}),
  encryptionKey: text("encryption_key").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const personalAgentMemories = pgTable("personal_agent_memories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  vaultType: text("vault_type").notNull().default("personal"),
  sensitivity: text("sensitivity").notNull().default("private"),
  domain: text("domain").notNull(),
  content: text("content").notNull(),
  tags: text("tags").array(),
  importance: integer("importance").notNull().default(5),
  confirmed: boolean("confirmed").notNull().default(false),
  encrypted: boolean("encrypted").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const personalAgentConversations = pgTable("personal_agent_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull().default("New Conversation"),
  domain: text("domain").notNull().default("general"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const personalAgentMessages = pgTable("personal_agent_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  isVoice: boolean("is_voice").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const personalAgentTasks = pgTable("personal_agent_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  dueDate: timestamp("due_date"),
  reminderAt: timestamp("reminder_at"),
  recurrence: text("recurrence"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const personalAgentDevices = pgTable("personal_agent_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  deviceName: text("device_name").notNull(),
  deviceType: text("device_type").notNull(),
  provider: text("provider").notNull(),
  connectionConfig: text("connection_config"),
  allowControl: boolean("allow_control").notNull().default(false),
  status: text("status").notNull().default("disconnected"),
  lastSeen: timestamp("last_seen"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const personalAgentFinance = pgTable("personal_agent_finance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  entryType: text("entry_type").notNull(),
  title: text("title").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  dueDate: timestamp("due_date"),
  recurring: boolean("recurring").notNull().default(false),
  recurrencePattern: text("recurrence_pattern"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const personalAgentUsage = pgTable("personal_agent_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  actionType: text("action_type").notNull(),
  creditsUsed: integer("credits_used").notNull().default(1),
  dateKey: text("date_key").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ============ Universal Agent Privacy & Restriction Framework ============

export const agentPrivacyVaults = pgTable("agent_privacy_vaults", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  ownerId: varchar("owner_id").notNull(),
  vaultKey: text("vault_key").notNull(),
  privacyMode: text("privacy_mode").notNull().default("personal"),
  learningPermission: boolean("learning_permission").notNull().default(true),
  sharingPermission: boolean("sharing_permission").notNull().default(false),
  communicationScope: text("communication_scope").notNull().default("owner_only"),
  dataExportPermission: boolean("data_export_permission").notNull().default(false),
  executionAutonomy: text("execution_autonomy").notNull().default("supervised"),
  allowedAgents: text("allowed_agents").array(),
  blockedAgents: text("blocked_agents").array(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const privacyAccessLogs = pgTable("privacy_access_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vaultId: varchar("vault_id").notNull(),
  requesterId: varchar("requester_id").notNull(),
  requesterType: text("requester_type").notNull(),
  resourceType: text("resource_type").notNull(),
  action: text("action").notNull(),
  granted: boolean("granted").notNull(),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const privacyViolations = pgTable("privacy_violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vaultId: varchar("vault_id").notNull(),
  violatorId: varchar("violator_id").notNull(),
  violationType: text("violation_type").notNull(),
  severity: text("severity").notNull().default("medium"),
  description: text("description").notNull(),
  actionTaken: text("action_taken"),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const privacyGatewayRules = pgTable("privacy_gateway_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  ruleType: text("rule_type").notNull(),
  conditions: jsonb("conditions").notNull(),
  action: text("action").notNull().default("block"),
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentPrivacyVaultSchema = createInsertSchema(agentPrivacyVaults).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPrivacyAccessLogSchema = createInsertSchema(privacyAccessLogs).omit({ id: true, createdAt: true });
export const insertPrivacyViolationSchema = createInsertSchema(privacyViolations).omit({ id: true, createdAt: true, resolvedAt: true });
export const insertPrivacyGatewayRuleSchema = createInsertSchema(privacyGatewayRules).omit({ id: true, createdAt: true });

export type AgentPrivacyVault = typeof agentPrivacyVaults.$inferSelect;
export type InsertAgentPrivacyVault = z.infer<typeof insertAgentPrivacyVaultSchema>;
export type PrivacyAccessLog = typeof privacyAccessLogs.$inferSelect;
export type InsertPrivacyAccessLog = z.infer<typeof insertPrivacyAccessLogSchema>;
export type PrivacyViolation = typeof privacyViolations.$inferSelect;
export type InsertPrivacyViolation = z.infer<typeof insertPrivacyViolationSchema>;
export type PrivacyGatewayRule = typeof privacyGatewayRules.$inferSelect;
export type InsertPrivacyGatewayRule = z.infer<typeof insertPrivacyGatewayRuleSchema>;

export const insertPersonalAgentProfileSchema = createInsertSchema(personalAgentProfiles).omit({ id: true, createdAt: true });
export const insertPersonalAgentMemorySchema = createInsertSchema(personalAgentMemories).omit({ id: true, createdAt: true });
export const insertPersonalAgentConversationSchema = createInsertSchema(personalAgentConversations).omit({ id: true, createdAt: true });
export const insertPersonalAgentMessageSchema = createInsertSchema(personalAgentMessages).omit({ id: true, createdAt: true });
export const insertPersonalAgentTaskSchema = createInsertSchema(personalAgentTasks).omit({ id: true, createdAt: true, completedAt: true });
export const insertPersonalAgentDeviceSchema = createInsertSchema(personalAgentDevices).omit({ id: true, createdAt: true, lastSeen: true });
export const insertPersonalAgentFinanceSchema = createInsertSchema(personalAgentFinance).omit({ id: true, createdAt: true });
export const insertPersonalAgentUsageSchema = createInsertSchema(personalAgentUsage).omit({ id: true, createdAt: true });

export type PersonalAgentProfile = typeof personalAgentProfiles.$inferSelect;
export type InsertPersonalAgentProfile = z.infer<typeof insertPersonalAgentProfileSchema>;
export type PersonalAgentMemory = typeof personalAgentMemories.$inferSelect;
export type InsertPersonalAgentMemory = z.infer<typeof insertPersonalAgentMemorySchema>;
export type PersonalAgentConversation = typeof personalAgentConversations.$inferSelect;
export type InsertPersonalAgentConversation = z.infer<typeof insertPersonalAgentConversationSchema>;
export type PersonalAgentMessage = typeof personalAgentMessages.$inferSelect;
export type InsertPersonalAgentMessage = z.infer<typeof insertPersonalAgentMessageSchema>;
export type PersonalAgentTask = typeof personalAgentTasks.$inferSelect;
export type InsertPersonalAgentTask = z.infer<typeof insertPersonalAgentTaskSchema>;
export type PersonalAgentDevice = typeof personalAgentDevices.$inferSelect;
export type InsertPersonalAgentDevice = z.infer<typeof insertPersonalAgentDeviceSchema>;
export type PersonalAgentFinanceEntry = typeof personalAgentFinance.$inferSelect;
export type InsertPersonalAgentFinanceEntry = z.infer<typeof insertPersonalAgentFinanceSchema>;
export type PersonalAgentUsage = typeof personalAgentUsage.$inferSelect;
export type InsertPersonalAgentUsage = z.infer<typeof insertPersonalAgentUsageSchema>;

// Trust Moat Framework
export const userTrustVaults = pgTable("user_trust_vaults", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  encryptionKeyHash: text("encryption_key_hash").notNull(),
  dataCategories: text("data_categories").array().notNull().default(sql`ARRAY['personal','conversations','preferences','activity']::text[]`),
  storageUsedBytes: integer("storage_used_bytes").notNull().default(0),
  privacyLevel: text("privacy_level").notNull().default("strict"),
  autoDeleteDays: integer("auto_delete_days"),
  lastAccessedAt: timestamp("last_accessed_at"),
  isLocked: boolean("is_locked").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trustPermissionTokens = pgTable("trust_permission_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vaultId: varchar("vault_id").notNull(),
  grantedTo: varchar("granted_to").notNull(),
  grantedBy: varchar("granted_by").notNull(),
  permissionType: text("permission_type").notNull(),
  resourceScope: text("resource_scope").notNull(),
  expiresAt: timestamp("expires_at"),
  isRevoked: boolean("is_revoked").notNull().default(false),
  revokedAt: timestamp("revoked_at"),
  accessCount: integer("access_count").notNull().default(0),
  maxAccessCount: integer("max_access_count"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trustAccessEvents = pgTable("trust_access_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vaultId: varchar("vault_id").notNull(),
  userId: varchar("user_id").notNull(),
  accessorId: varchar("accessor_id").notNull(),
  accessorType: text("accessor_type").notNull(),
  resourceAccessed: text("resource_accessed").notNull(),
  purpose: text("purpose").notNull(),
  granted: boolean("granted").notNull(),
  permissionTokenId: varchar("permission_token_id"),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trustHealthMetrics = pgTable("trust_health_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricDate: timestamp("metric_date").notNull(),
  totalVaults: integer("total_vaults").notNull().default(0),
  activeVaults: integer("active_vaults").notNull().default(0),
  totalPermissionTokens: integer("total_permission_tokens").notNull().default(0),
  revokedTokens: integer("revoked_tokens").notNull().default(0),
  totalAccessEvents: integer("total_access_events").notNull().default(0),
  deniedAccessEvents: integer("denied_access_events").notNull().default(0),
  dataExportRequests: integer("data_export_requests").notNull().default(0),
  averagePrivacyLevel: real("average_privacy_level").notNull().default(0),
  trustScore: real("trust_score").notNull().default(0),
  userRetentionRate: real("user_retention_rate").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserTrustVaultSchema = createInsertSchema(userTrustVaults).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrustPermissionTokenSchema = createInsertSchema(trustPermissionTokens).omit({ id: true, createdAt: true, revokedAt: true });
export const insertTrustAccessEventSchema = createInsertSchema(trustAccessEvents).omit({ id: true, createdAt: true });
export const insertTrustHealthMetricSchema = createInsertSchema(trustHealthMetrics).omit({ id: true, createdAt: true });

export type UserTrustVault = typeof userTrustVaults.$inferSelect;
export type InsertUserTrustVault = z.infer<typeof insertUserTrustVaultSchema>;
export type TrustPermissionToken = typeof trustPermissionTokens.$inferSelect;
export type InsertTrustPermissionToken = z.infer<typeof insertTrustPermissionTokenSchema>;
export type TrustAccessEvent = typeof trustAccessEvents.$inferSelect;
export type InsertTrustAccessEvent = z.infer<typeof insertTrustAccessEventSchema>;
export type TrustHealthMetric = typeof trustHealthMetrics.$inferSelect;
export type InsertTrustHealthMetric = z.infer<typeof insertTrustHealthMetricSchema>;

// Intelligence Roadmap
export const intelligenceXpLogs = pgTable("intelligence_xp_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  source: text("source").notNull(),
  xpAmount: integer("xp_amount").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertIntelligenceXpLogSchema = createInsertSchema(intelligenceXpLogs).omit({ id: true, createdAt: true });
export type IntelligenceXpLog = typeof intelligenceXpLogs.$inferSelect;
export type InsertIntelligenceXpLog = z.infer<typeof insertIntelligenceXpLogSchema>;

// User Psychology Progress System
export const userPsychologyProfiles = pgTable("user_psychology_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  psychologyStage: text("psychology_stage").notNull().default("curious"),
  conversationsPerDay: real("conversations_per_day").notNull().default(0),
  memorySaves: integer("memory_saves").notNull().default(0),
  returnFrequency: real("return_frequency").notNull().default(0),
  personalAgentUsage: integer("personal_agent_usage").notNull().default(0),
  featureUnlockStage: text("feature_unlock_stage").notNull().default("explorer"),
  engagementScore: real("engagement_score").notNull().default(0),
  retentionRisk: text("retention_risk").notNull().default("neutral"),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  streakDays: integer("streak_days").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  totalSessions: integer("total_sessions").notNull().default(0),
  avgSessionMinutes: real("avg_session_minutes").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const psychologySnapshots = pgTable("psychology_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotDate: timestamp("snapshot_date").notNull().defaultNow(),
  totalUsers: integer("total_users").notNull().default(0),
  stageDistribution: jsonb("stage_distribution").$type<Record<string, number>>().notNull().default({}),
  avgEngagementScore: real("avg_engagement_score").notNull().default(0),
  avgReturnFrequency: real("avg_return_frequency").notNull().default(0),
  avgConversationsPerDay: real("avg_conversations_per_day").notNull().default(0),
  retentionRiskDistribution: jsonb("retention_risk_distribution").$type<Record<string, number>>().notNull().default({}),
  stageTransitions: jsonb("stage_transitions").$type<{ from: string; to: string; count: number }[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserPsychologyProfileSchema = createInsertSchema(userPsychologyProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPsychologySnapshotSchema = createInsertSchema(psychologySnapshots).omit({ id: true, createdAt: true });
export type UserPsychologyProfile = typeof userPsychologyProfiles.$inferSelect;
export type InsertUserPsychologyProfile = z.infer<typeof insertUserPsychologyProfileSchema>;
export type PsychologySnapshot = typeof psychologySnapshots.$inferSelect;
export type InsertPsychologySnapshot = z.infer<typeof insertPsychologySnapshotSchema>;

// ---- PSYCHOLOGY-BASED MONETIZATION ----

export const monetizationEvents = pgTable("monetization_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  eventType: text("event_type").notNull(), // prompt_shown, prompt_clicked, conversion, credit_spend, feature_blocked
  triggerType: text("trigger_type").notNull(), // memory_limit, advanced_reasoning, voice_access, agent_training, marketplace_publish
  psychologyStage: text("psychology_stage").notNull(), // stage at time of event
  engagementScore: real("engagement_score").notNull().default(0),
  currentPlan: text("current_plan").notNull().default("free"),
  suggestedPlan: text("suggested_plan"),
  creditsCost: integer("credits_cost"),
  converted: boolean("converted").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMonetizationEventSchema = createInsertSchema(monetizationEvents).omit({ id: true, createdAt: true });
export type MonetizationEvent = typeof monetizationEvents.$inferSelect;
export type InsertMonetizationEvent = z.infer<typeof insertMonetizationEventSchema>;

// ---- PLATFORM RISK MANAGEMENT ----

export const riskAuditLogs = pgTable("risk_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorId: varchar("actor_id").notNull(),
  actorType: text("actor_type").notNull(), // user, agent, system, admin
  action: text("action").notNull(), // ai_call, memory_access, data_export, data_delete, config_change, login, credit_spend
  resourceType: text("resource_type").notNull(), // ai_gateway, privacy_vault, user_data, agent_data, system_config
  resourceId: varchar("resource_id"),
  outcome: text("outcome").notNull().default("success"), // success, denied, error
  riskLevel: text("risk_level").notNull().default("low"), // low, medium, high, critical
  details: jsonb("details").$type<Record<string, any>>().default({}),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const riskSnapshots = pgTable("risk_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotDate: timestamp("snapshot_date").notNull().defaultNow(),
  technicalRisk: real("technical_risk").notNull().default(0), // 0-100 score
  economicRisk: real("economic_risk").notNull().default(0),
  privacyRisk: real("privacy_risk").notNull().default(0),
  ecosystemRisk: real("ecosystem_risk").notNull().default(0),
  legalRisk: real("legal_risk").notNull().default(0),
  overallRisk: real("overall_risk").notNull().default(0),
  metrics: jsonb("metrics").$type<{
    aiGateway: { totalRequests: number; failedRequests: number; blockedByCredits: number; blockedByRateLimit: number };
    privacy: { totalViolations: number; unresolvedViolations: number; criticalViolations: number };
    economy: { totalCreditsInCirculation: number; avgCreditBalance: number; creditBurnRate: number };
    ecosystem: { totalUsers: number; activeUsers: number; totalAgents: number; contentQuality: number; spamRate: number };
    legal: { pendingExports: number; pendingDeletions: number; overdueDeletions: number };
  }>().default({} as any),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dataRequests = pgTable("data_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  requestType: text("request_type").notNull(), // export, deletion
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  requestedAt: timestamp("requested_at").defaultNow(),
  processedAt: timestamp("processed_at"),
  completedAt: timestamp("completed_at"),
  downloadUrl: text("download_url"),
  notes: text("notes"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
});

export const insertRiskAuditLogSchema = createInsertSchema(riskAuditLogs).omit({ id: true, createdAt: true });
export const insertRiskSnapshotSchema = createInsertSchema(riskSnapshots).omit({ id: true, createdAt: true });
export const insertDataRequestSchema = createInsertSchema(dataRequests).omit({ id: true, requestedAt: true, processedAt: true, completedAt: true });

export type RiskAuditLog = typeof riskAuditLogs.$inferSelect;
export type InsertRiskAuditLog = z.infer<typeof insertRiskAuditLogSchema>;
export type RiskSnapshot = typeof riskSnapshots.$inferSelect;
export type InsertRiskSnapshot = z.infer<typeof insertRiskSnapshotSchema>;
export type DataRequest = typeof dataRequests.$inferSelect;
export type InsertDataRequest = z.infer<typeof insertDataRequestSchema>;

// ---- TRUTH-ANCHORED EVOLUTION ----

export const truthMemories = pgTable("truth_memories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  userId: varchar("user_id").notNull(),
  vaultType: text("vault_type").notNull().default("personal"),
  sensitivity: text("sensitivity").notNull().default("private"),
  content: text("content").notNull(),
  truthType: text("truth_type").notNull().default("personal_truth"), // personal_truth, objective_fact, contextual_interpretation
  confidenceScore: real("confidence_score").notNull().default(0.5),
  evidenceCount: integer("evidence_count").notNull().default(0),
  contradictionCount: integer("contradiction_count").notNull().default(0),
  validationCount: integer("validation_count").notNull().default(0),
  lastEvaluatedAt: timestamp("last_evaluated_at").defaultNow(),
  sources: jsonb("sources").$type<string[]>().default([]),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const truthEvolutionEvents = pgTable("truth_evolution_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  memoryId: varchar("memory_id"),
  eventType: text("event_type").notNull(), // fact_correction, knowledge_update, confidence_shift, contradiction_detected, expert_validation
  previousConfidence: real("previous_confidence"),
  newConfidence: real("new_confidence"),
  trigger: text("trigger").notNull(), // new_evidence, contradiction, expert_review, decay
  description: text("description"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const truthAlignmentSnapshots = pgTable("truth_alignment_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotDate: timestamp("snapshot_date").notNull().defaultNow(),
  totalMemories: integer("total_memories").notNull().default(0),
  avgConfidence: real("avg_confidence").notNull().default(0),
  truthTypeDistribution: jsonb("truth_type_distribution").$type<Record<string, number>>().notNull().default({}),
  evolutionEvents24h: integer("evolution_events_24h").notNull().default(0),
  correctionsCount: integer("corrections_count").notNull().default(0),
  highConfidenceRatio: real("high_confidence_ratio").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTruthMemorySchema = createInsertSchema(truthMemories).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTruthEvolutionEventSchema = createInsertSchema(truthEvolutionEvents).omit({ id: true, createdAt: true });
export const insertTruthAlignmentSnapshotSchema = createInsertSchema(truthAlignmentSnapshots).omit({ id: true, createdAt: true });
export type TruthMemory = typeof truthMemories.$inferSelect;
export type InsertTruthMemory = z.infer<typeof insertTruthMemorySchema>;
export type TruthEvolutionEvent = typeof truthEvolutionEvents.$inferSelect;
export type InsertTruthEvolutionEvent = z.infer<typeof insertTruthEvolutionEventSchema>;
export type TruthAlignmentSnapshot = typeof truthAlignmentSnapshots.$inferSelect;
export type InsertTruthAlignmentSnapshot = z.infer<typeof insertTruthAlignmentSnapshotSchema>;

// ---- REALITY ALIGNMENT LAYER ----

export const realityClaims = pgTable("reality_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  content: text("content").notNull(),
  sourcePostId: varchar("source_post_id"),
  sourceCommentId: varchar("source_comment_id"),
  extractedBy: varchar("extracted_by").notNull(), // agent or system ID
  status: text("status").notNull().default("unverified"), // unverified, contested, supported, consensus
  confidenceScore: real("confidence_score").notNull().default(0.5),
  agreementLevel: real("agreement_level").notNull().default(0),
  evidenceStrength: real("evidence_strength").notNull().default(0),
  contradictionCount: integer("contradiction_count").notNull().default(0),
  evaluationCount: integer("evaluation_count").notNull().default(0),
  domain: text("domain"),
  tags: text("tags").array(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const claimEvidence = pgTable("claim_evidence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  submittedBy: varchar("submitted_by").notNull(),
  submitterType: text("submitter_type").notNull().default("user"), // user, agent, system
  evidenceType: text("evidence_type").notNull(), // supporting, contradicting, neutral
  content: text("content").notNull(),
  sourceUrl: text("source_url"),
  weight: real("weight").notNull().default(1.0),
  trustScore: real("trust_score").notNull().default(0.5),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const consensusRecords = pgTable("consensus_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  previousStatus: text("previous_status").notNull(),
  newStatus: text("new_status").notNull(),
  previousConfidence: real("previous_confidence").notNull(),
  newConfidence: real("new_confidence").notNull(),
  participantCount: integer("participant_count").notNull().default(0),
  evidenceCount: integer("evidence_count").notNull().default(0),
  debateRounds: integer("debate_rounds").notNull().default(0),
  trigger: text("trigger").notNull(), // evidence_added, debate_completed, re_evaluation, expert_review
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRealityClaimSchema = createInsertSchema(realityClaims).omit({ id: true, createdAt: true, updatedAt: true });
export const insertClaimEvidenceSchema = createInsertSchema(claimEvidence).omit({ id: true, createdAt: true });
export const insertConsensusRecordSchema = createInsertSchema(consensusRecords).omit({ id: true, createdAt: true });
export type RealityClaim = typeof realityClaims.$inferSelect;
export type InsertRealityClaim = z.infer<typeof insertRealityClaimSchema>;
export type ClaimEvidence = typeof claimEvidence.$inferSelect;
export type InsertClaimEvidence = z.infer<typeof insertClaimEvidenceSchema>;
export type ConsensusRecord = typeof consensusRecords.$inferSelect;
export type InsertConsensusRecord = z.infer<typeof insertConsensusRecordSchema>;

// ---- KNOWLEDGE GRAPH FOUNDATION ----

export const knowledgeGraphNodes = pgTable("knowledge_graph_nodes", {
  nodeKey: text("node_key").primaryKey(),
  nodeType: text("node_type").notNull(),
  label: text("label").notNull(),
  summary: text("summary"),
  sourceTable: text("source_table").notNull(),
  sourceId: text("source_id").notNull(),
  confidence: real("confidence").notNull().default(0.5),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  vaultType: text("vault_type").notNull().default("public"),
  sensitivity: text("sensitivity").notNull().default("public"),
  visibility: text("visibility").notNull().default("internal"),
  provenance: jsonb("provenance").$type<Record<string, any>>().notNull().default({}),
  metadata: jsonb("metadata").$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const knowledgeGraphEdges = pgTable("knowledge_graph_edges", {
  edgeKey: text("edge_key").primaryKey(),
  sourceNodeKey: text("source_node_key").notNull(),
  targetNodeKey: text("target_node_key").notNull(),
  relationType: text("relation_type").notNull(),
  confidence: real("confidence").notNull().default(0.5),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  vaultType: text("vault_type").notNull().default("public"),
  sensitivity: text("sensitivity").notNull().default("public"),
  visibility: text("visibility").notNull().default("internal"),
  provenance: jsonb("provenance").$type<Record<string, any>>().notNull().default({}),
  metadata: jsonb("metadata").$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertKnowledgeGraphNodeSchema = createInsertSchema(knowledgeGraphNodes).omit({ createdAt: true, updatedAt: true });
export const insertKnowledgeGraphEdgeSchema = createInsertSchema(knowledgeGraphEdges).omit({ createdAt: true, updatedAt: true });
export type KnowledgeGraphNode = typeof knowledgeGraphNodes.$inferSelect;
export type InsertKnowledgeGraphNode = typeof knowledgeGraphNodes.$inferInsert;
export type KnowledgeGraphEdge = typeof knowledgeGraphEdges.$inferSelect;
export type InsertKnowledgeGraphEdge = typeof knowledgeGraphEdges.$inferInsert;

// ---- LABS SYSTEM ----

export const labsOpportunities = pgTable("labs_opportunities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  industry: text("industry").notNull(),
  category: text("category").notNull(),
  problemStatement: text("problem_statement").notNull(),
  solution: text("solution").notNull(),
  developmentSpec: jsonb("development_spec").$type<{
    techStack: string[];
    features: string[];
    estimatedHours: number;
    complexity: string;
    scaffoldTemplate: string;
  }>().notNull(),
  monetizationModel: text("monetization_model").notNull(),
  revenueEstimate: text("revenue_estimate"),
  legalRequirements: text("legal_requirements").array().notNull(),
  legalDisclaimers: text("legal_disclaimers").array().notNull(),
  targetAudience: text("target_audience"),
  competitiveEdge: text("competitive_edge"),
  difficulty: text("difficulty").notNull().default("intermediate"),
  trending: boolean("trending").notNull().default(false),
  buildCount: integer("build_count").notNull().default(0),
  generatedBy: text("generated_by").notNull().default("system"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const labsApps = pgTable("labs_apps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  opportunityId: varchar("opportunity_id"),
  projectPackageId: varchar("project_package_id"),
  creatorId: varchar("creator_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon"),
  screenshots: text("screenshots").array(),
  category: text("category").notNull(),
  industry: text("industry").notNull(),
  pricingModel: text("pricing_model").notNull().default("free"),
  price: integer("price").default(0),
  subscriptionInterval: text("subscription_interval"),
  replitProjectUrl: text("replit_project_url"),
  liveUrl: text("live_url"),
  pwaEnabled: boolean("pwa_enabled").notNull().default(false),
  legalDisclaimers: text("legal_disclaimers").array(),
  installCount: integer("install_count").notNull().default(0),
  rating: real("rating").default(0),
  reviewCount: integer("review_count").notNull().default(0),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const labsFavorites = pgTable("labs_favorites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  itemId: varchar("item_id").notNull(),
  itemType: text("item_type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const labsInstallations = pgTable("labs_installations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  appId: varchar("app_id").notNull(),
  status: text("status").notNull().default("installed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const labsReviews = pgTable("labs_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appId: varchar("app_id").notNull(),
  userId: varchar("user_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLabsOpportunitySchema = createInsertSchema(labsOpportunities).omit({ id: true, createdAt: true });
export const insertLabsAppSchema = createInsertSchema(labsApps).omit({ id: true, createdAt: true });
export const insertLabsFavoriteSchema = createInsertSchema(labsFavorites).omit({ id: true, createdAt: true });
export const insertLabsInstallationSchema = createInsertSchema(labsInstallations).omit({ id: true, createdAt: true });
export const insertLabsReviewSchema = createInsertSchema(labsReviews).omit({ id: true, createdAt: true });

export type LabsOpportunity = typeof labsOpportunities.$inferSelect;
export type InsertLabsOpportunity = z.infer<typeof insertLabsOpportunitySchema>;
export type LabsApp = typeof labsApps.$inferSelect;
export type InsertLabsApp = z.infer<typeof insertLabsAppSchema>;
export type LabsFavorite = typeof labsFavorites.$inferSelect;
export type InsertLabsFavorite = z.infer<typeof insertLabsFavoriteSchema>;
export type LabsInstallation = typeof labsInstallations.$inferSelect;
export type InsertLabsInstallation = z.infer<typeof insertLabsInstallationSchema>;
export type LabsReview = typeof labsReviews.$inferSelect;
export type InsertLabsReview = z.infer<typeof insertLabsReviewSchema>;

export const labsFlywheelAnalytics = pgTable("labs_flywheel_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull(),
  totalOpportunities: integer("total_opportunities").notNull().default(0),
  totalBuilds: integer("total_builds").notNull().default(0),
  totalPublished: integer("total_published").notNull().default(0),
  totalInstalls: integer("total_installs").notNull().default(0),
  totalRevenue: integer("total_revenue").notNull().default(0),
  activeCreators: integer("active_creators").notNull().default(0),
  newUsers: integer("new_users").notNull().default(0),
  referralSignups: integer("referral_signups").notNull().default(0),
  retentionRate: real("retention_rate").default(0),
  conversionRate: real("conversion_rate").default(0),
  topIndustry: text("top_industry"),
  topCategory: text("top_category"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const labsReferrals = pgTable("labs_referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appId: varchar("app_id").notNull(),
  creatorId: varchar("creator_id").notNull(),
  referralCode: varchar("referral_code").notNull(),
  clicks: integer("clicks").notNull().default(0),
  signups: integer("signups").notNull().default(0),
  installs: integer("installs").notNull().default(0),
  revenue: integer("revenue").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const labsCreatorRankings = pgTable("labs_creator_rankings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").notNull(),
  totalApps: integer("total_apps").notNull().default(0),
  totalInstalls: integer("total_installs").notNull().default(0),
  totalRevenue: integer("total_revenue").notNull().default(0),
  totalReferrals: integer("total_referrals").notNull().default(0),
  avgRating: real("avg_rating").default(0),
  rank: integer("rank").notNull().default(0),
  tier: text("tier").notNull().default("starter"),
  streak: integer("streak").notNull().default(0),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const labsLandingPages = pgTable("labs_landing_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appId: varchar("app_id").notNull(),
  slug: varchar("slug").notNull(),
  headline: text("headline").notNull(),
  subheadline: text("subheadline"),
  features: text("features").array(),
  ctaText: text("cta_text").notNull().default("Get Started"),
  ctaUrl: text("cta_url"),
  testimonials: jsonb("testimonials").$type<{ name: string; quote: string; avatar?: string }[]>(),
  socialProof: jsonb("social_proof").$type<{ installs: number; rating: number; reviews: number }>(),
  referralCode: varchar("referral_code"),
  views: integer("views").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLabsFlywheelAnalyticsSchema = createInsertSchema(labsFlywheelAnalytics).omit({ id: true, createdAt: true });
export const insertLabsReferralSchema = createInsertSchema(labsReferrals).omit({ id: true, createdAt: true });
export const insertLabsCreatorRankingSchema = createInsertSchema(labsCreatorRankings).omit({ id: true, updatedAt: true });
export const insertLabsLandingPageSchema = createInsertSchema(labsLandingPages).omit({ id: true, createdAt: true });

export type LabsFlywheelAnalytics = typeof labsFlywheelAnalytics.$inferSelect;
export type InsertLabsFlywheelAnalytics = z.infer<typeof insertLabsFlywheelAnalyticsSchema>;
export type LabsReferral = typeof labsReferrals.$inferSelect;
export type InsertLabsReferral = z.infer<typeof insertLabsReferralSchema>;
export type LabsCreatorRanking = typeof labsCreatorRankings.$inferSelect;
export type InsertLabsCreatorRanking = z.infer<typeof insertLabsCreatorRankingSchema>;
export type LabsLandingPage = typeof labsLandingPages.$inferSelect;
export type InsertLabsLandingPage = z.infer<typeof insertLabsLandingPageSchema>;

export const superLoopCycles = pgTable("super_loop_cycles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stage: text("stage").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: varchar("source_id"),
  targetType: text("target_type"),
  targetId: varchar("target_id"),
  pillar: text("pillar").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  revenueAttributed: integer("revenue_attributed").notNull().default(0),
  completedStages: integer("completed_stages").notNull().default(1),
  totalStages: integer("total_stages").notNull().default(6),
  velocity: real("velocity").default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const superLoopMetrics = pgTable("super_loop_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull(),
  personalInteractions: integer("personal_interactions").notNull().default(0),
  debatesActive: integer("debates_active").notNull().default(0),
  realityClaims: integer("reality_claims_count").notNull().default(0),
  consensusReached: integer("consensus_reached").notNull().default(0),
  labsOpportunities: integer("labs_opportunities").notNull().default(0),
  appsPublished: integer("apps_published").notNull().default(0),
  appsInstalled: integer("apps_installed").notNull().default(0),
  totalRevenue: integer("total_revenue").notNull().default(0),
  knowledgeFeedback: integer("knowledge_feedback").notNull().default(0),
  loopVelocity: real("loop_velocity").default(0),
  reinforcementScore: real("reinforcement_score").default(0),
  pillarHealth: jsonb("pillar_health").$type<{
    personal: number;
    collective: number;
    labs: number;
    economy: number;
  }>(),
  cycleCompletions: integer("cycle_completions").notNull().default(0),
  avgCycleTime: real("avg_cycle_time").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSuperLoopCycleSchema = createInsertSchema(superLoopCycles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSuperLoopMetricsSchema = createInsertSchema(superLoopMetrics).omit({ id: true, createdAt: true });

export type SuperLoopCycle = typeof superLoopCycles.$inferSelect;
export type InsertSuperLoopCycle = z.infer<typeof insertSuperLoopCycleSchema>;
export type SuperLoopMetrics = typeof superLoopMetrics.$inferSelect;
export type InsertSuperLoopMetrics = z.infer<typeof insertSuperLoopMetricsSchema>;

export const creatorPayoutAccounts = pgTable("creator_payout_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  razorpayAccountId: text("razorpay_account_id"),
  onboardingStatus: text("onboarding_status").notNull().default("pending"),
  businessName: text("business_name"),
  email: text("email"),
  totalEarnings: integer("total_earnings").notNull().default(0),
  totalWithdrawn: integer("total_withdrawn").notNull().default(0),
  pendingAmount: integer("pending_amount").notNull().default(0),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const marketplaceOrders = pgTable("marketplace_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  buyerId: varchar("buyer_id").notNull(),
  sellerId: varchar("seller_id").notNull(),
  listingId: varchar("listing_id").notNull(),
  amountTotal: integer("amount_total").notNull(),
  amountCreator: integer("amount_creator").notNull(),
  amountPlatform: integer("amount_platform").notNull(),
  currency: text("currency").notNull().default("INR"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  razorpayTransferId: text("razorpay_transfer_id"),
  status: text("status").notNull().default("created"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const creatorEarnings = pgTable("creator_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").notNull(),
  orderId: varchar("order_id").notNull(),
  listingId: varchar("listing_id").notNull(),
  amount: integer("amount").notNull(),
  platformFee: integer("platform_fee").notNull(),
  status: text("status").notNull().default("pending"),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCreatorPayoutAccountSchema = createInsertSchema(creatorPayoutAccounts).omit({ id: true, createdAt: true, updatedAt: true, totalEarnings: true, totalWithdrawn: true, pendingAmount: true });
export const insertMarketplaceOrderSchema = createInsertSchema(marketplaceOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCreatorEarningSchema = createInsertSchema(creatorEarnings).omit({ id: true, createdAt: true });

export type CreatorPayoutAccount = typeof creatorPayoutAccounts.$inferSelect;
export type InsertCreatorPayoutAccount = z.infer<typeof insertCreatorPayoutAccountSchema>;
export type MarketplaceOrder = typeof marketplaceOrders.$inferSelect;
export type InsertMarketplaceOrder = z.infer<typeof insertMarketplaceOrderSchema>;
export type CreatorEarning = typeof creatorEarnings.$inferSelect;
export type InsertCreatorEarning = z.infer<typeof insertCreatorEarningSchema>;

export const creatorPublisherProfiles = pgTable("creator_publisher_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  publisherName: text("publisher_name").notNull(),
  companyName: text("company_name"),
  businessType: text("business_type").notNull().default("individual"),
  address: text("address").notNull(),
  city: text("city"),
  state: text("state"),
  country: text("country").notNull().default("India"),
  postalCode: text("postal_code"),
  supportEmail: text("support_email").notNull(),
  supportPhone: text("support_phone"),
  websiteUrl: text("website_url"),
  agreementVersion: text("agreement_version"),
  agreementAcceptedAt: timestamp("agreement_accepted_at"),
  agreementIpAddress: text("agreement_ip_address"),
  trustLevel: text("trust_level").notNull().default("explorer"),
  isVerified: boolean("is_verified").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCreatorPublisherProfileSchema = createInsertSchema(creatorPublisherProfiles).omit({ id: true, createdAt: true, updatedAt: true, isVerified: true });
export type CreatorPublisherProfile = typeof creatorPublisherProfiles.$inferSelect;
export type InsertCreatorPublisherProfile = z.infer<typeof insertCreatorPublisherProfileSchema>;

export const appModerationReports = pgTable("app_moderation_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appId: varchar("app_id").notNull(),
  reporterId: varchar("reporter_id").notNull(),
  reason: text("reason").notNull(),
  category: text("category").notNull().default("other"),
  description: text("description"),
  evidence: text("evidence"),
  status: text("status").notNull().default("pending"),
  moderatorId: varchar("moderator_id"),
  moderatorNotes: text("moderator_notes"),
  actionTaken: text("action_taken"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const appRiskDisclaimers = pgTable("app_risk_disclaimers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appId: varchar("app_id").notNull(),
  riskCategory: text("risk_category").notNull(),
  riskLevel: text("risk_level").notNull().default("low"),
  disclaimerText: text("disclaimer_text").notNull(),
  regulatoryTags: text("regulatory_tags").array(),
  autoGenerated: boolean("auto_generated").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiUsageViolations = pgTable("ai_usage_violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appId: varchar("app_id"),
  userId: varchar("user_id"),
  violationType: text("violation_type").notNull(),
  severity: text("severity").notNull().default("warning"),
  description: text("description").notNull(),
  inputContent: text("input_content"),
  outputContent: text("output_content"),
  actionTaken: text("action_taken").notNull().default("logged"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dailyCreationLimits = pgTable("daily_creation_limits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  date: text("date").notNull(),
  appsCreated: integer("apps_created").notNull().default(0),
  buildsStarted: integer("builds_started").notNull().default(0),
  limitReached: boolean("limit_reached").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAppModerationReportSchema = createInsertSchema(appModerationReports).omit({ id: true, createdAt: true });
export type AppModerationReport = typeof appModerationReports.$inferSelect;
export type InsertAppModerationReport = z.infer<typeof insertAppModerationReportSchema>;

export const insertAppRiskDisclaimerSchema = createInsertSchema(appRiskDisclaimers).omit({ id: true, createdAt: true });
export type AppRiskDisclaimer = typeof appRiskDisclaimers.$inferSelect;

export const insertAiUsageViolationSchema = createInsertSchema(aiUsageViolations).omit({ id: true, createdAt: true });
export type AiUsageViolation = typeof aiUsageViolations.$inferSelect;

export const insertDailyCreationLimitSchema = createInsertSchema(dailyCreationLimits).omit({ id: true, updatedAt: true });
export type DailyCreationLimit = typeof dailyCreationLimits.$inferSelect;

export const creatorPromotionDeclarations = pgTable("creator_promotion_declarations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  marketingMethods: text("marketing_methods").array().notNull(),
  targetAudience: text("target_audience"),
  promotionChannels: text("promotion_channels").array(),
  spamAgreement: boolean("spam_agreement").notNull().default(false),
  legalComplianceAgreement: boolean("legal_compliance_agreement").notNull().default(false),
  dataUsageConsent: boolean("data_usage_consent").notNull().default(false),
  additionalNotes: text("additional_notes"),
  declarationVersion: text("declaration_version").notNull().default("1.0"),
  acceptedAt: timestamp("accepted_at").defaultNow(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCreatorPromotionDeclarationSchema = createInsertSchema(creatorPromotionDeclarations).omit({ id: true, createdAt: true, updatedAt: true });
export type CreatorPromotionDeclaration = typeof creatorPromotionDeclarations.$inferSelect;
export type InsertCreatorPromotionDeclaration = z.infer<typeof insertCreatorPromotionDeclarationSchema>;

export const trustLadderProfiles = pgTable("trust_ladder_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  trustLevel: text("trust_level").notNull().default("visitor"),
  trustScore: real("trust_score").notNull().default(0),
  activityQuality: real("activity_quality").notNull().default(0),
  identityVerification: real("identity_verification").notNull().default(0),
  publisherAgreement: real("publisher_agreement").notNull().default(0),
  ratings: real("ratings").notNull().default(0),
  policyViolations: real("policy_violations").notNull().default(0),
  canPublish: boolean("can_publish").notNull().default(false),
  canSell: boolean("can_sell").notNull().default(false),
  canPromote: boolean("can_promote").notNull().default(false),
  canBuildEntities: boolean("can_build_entities").notNull().default(false),
  canPartner: boolean("can_partner").notNull().default(false),
  lastComputedAt: timestamp("last_computed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTrustLadderProfileSchema = createInsertSchema(trustLadderProfiles).omit({ id: true, createdAt: true, updatedAt: true, lastComputedAt: true });
export type TrustLadderProfile = typeof trustLadderProfiles.$inferSelect;
export type InsertTrustLadderProfile = z.infer<typeof insertTrustLadderProfileSchema>;

export const pricingAnalyses = pgTable("pricing_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appId: varchar("app_id"),
  creatorId: varchar("creator_id").notNull(),
  appPrompt: text("app_prompt").notNull(),
  appName: text("app_name"),
  costBreakdown: jsonb("cost_breakdown").$type<{
    aiCompute: { monthly: number; perUser: number; details: string };
    hosting: { monthly: number; perUser: number; details: string };
    bandwidth: { monthly: number; perUser: number; details: string };
    support: { monthly: number; perUser: number; details: string };
    platformFee: { monthly: number; perUser: number; details: string };
    totalPerUser: number;
    totalMonthly: number;
  }>().notNull(),
  targetMargin: real("target_margin").notNull().default(0.5),
  minimumPrice: integer("minimum_price").notNull(),
  recommendedPrice: integer("recommended_price").notNull(),
  creatorSetPrice: integer("creator_set_price"),
  pricingModel: text("pricing_model").notNull().default("subscription"),
  estimatedUsers: integer("estimated_users").notNull().default(100),
  sustainable: boolean("sustainable").notNull().default(true),
  warnings: text("warnings").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPricingAnalysisSchema = createInsertSchema(pricingAnalyses).omit({ id: true, createdAt: true, updatedAt: true });
export type PricingAnalysis = typeof pricingAnalyses.$inferSelect;
export type InsertPricingAnalysis = z.infer<typeof insertPricingAnalysisSchema>;

export const appExports = pgTable("app_exports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").notNull(),
  appName: text("app_name").notNull(),
  analysisId: varchar("analysis_id"),
  exportType: text("export_type").notNull().default("web_package"),
  distributionAcknowledged: boolean("distribution_acknowledged").notNull().default(false),
  legalDisclaimerAccepted: boolean("legal_disclaimer_accepted").notNull().default(false),
  acknowledgmentText: text("acknowledgment_text"),
  status: text("status").notNull().default("pending"),
  exportedAt: timestamp("exported_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAppExportSchema = createInsertSchema(appExports).omit({ id: true, createdAt: true });
export type AppExport = typeof appExports.$inferSelect;
export type InsertAppExport = z.infer<typeof insertAppExportSchema>;

export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedBy: varchar("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ id: true, updatedAt: true });
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;

/* --------------------------------------------------------------------- */
/* productionAssetSweepFlappingConfigChanges (Task #810)                 */
/*   Audit trail of every change to the 3D-asset orphan-sweep flapping  */
/*   threshold / window settings. Lets the founder see at a glance      */
/*   whether the values were recently tuned (and by whom) before        */
/*   adjusting them again.                                              */
/* --------------------------------------------------------------------- */
export const productionAssetSweepFlappingConfigChanges = pgTable(
  "production_asset_sweep_flapping_config_changes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    setting: text("setting").notNull(),
    previousValue: text("previous_value"),
    newValue: text("new_value").notNull(),
    actorUserId: varchar("actor_user_id"),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (table) => [index("IDX_pa_sweep_flap_cfg_changed_at").on(table.changedAt)],
);
export type ProductionAssetSweepFlappingConfigChange =
  typeof productionAssetSweepFlappingConfigChanges.$inferSelect;

/* --------------------------------------------------------------------- */
/* productionAssetOrphanSweepThresholdChanges (Task #845)                */
/*   Audit trail of every change to the 3D-asset orphan-sweep alert     */
/*   threshold (the value tuned by POST /orphan-sweep/threshold —       */
/*   Task #791). The live value in `system_settings` only carries the   */
/*   CURRENT shape; this table closes the audit gap so founders can     */
/*   see who tuned the knob and when before re-tuning it. Mirrors the   */
/*   shape of `production_asset_sweep_flapping_config_changes`          */
/*   (Task #810).                                                       */
/* --------------------------------------------------------------------- */
export const productionAssetOrphanSweepThresholdChanges = pgTable(
  "production_asset_orphan_sweep_threshold_changes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    previousValue: text("previous_value"),
    newValue: text("new_value").notNull(),
    actorUserId: varchar("actor_user_id"),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (table) => [index("IDX_pa_sweep_thresh_changed_at").on(table.changedAt)],
);
export type ProductionAssetOrphanSweepThresholdChange =
  typeof productionAssetOrphanSweepThresholdChanges.$inferSelect;

/* --------------------------------------------------------------------- */
/* FounderPtoSuppressionLog (Task #621)                                   */
/*   Persistent history of every alert that PTO mode swallowed. The      */
/*   Founder PTO dashboard previously only showed a counter for the      */
/*   current window; this table makes the history durable so the         */
/*   founder can audit, after the fact, *which* notifier was muted,      */
/*   when, and any associated summary fields (file count, actor, ...).   */
/*   Rows are pruned by the audience retention sweeper on the same       */
/*   daily cadence as the other audit-history tables.                    */
/* --------------------------------------------------------------------- */
export const founderPtoSuppressionLog = pgTable(
  "founder_pto_suppression_log",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    notifierId: text("notifier_id").notNull(),
    snoozeSource: text("snooze_source"),
    effectiveUntil: timestamp("effective_until"),
    summary: text("summary"),
    payload: jsonb("payload"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("IDX_founder_pto_suppression_log_occurred_at").on(t.occurredAt),
    index("IDX_founder_pto_suppression_log_notifier_id").on(t.notifierId),
  ],
);
export type FounderPtoSuppressionLogRow = typeof founderPtoSuppressionLog.$inferSelect;

export const platformAlerts = pgTable("platform_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  severity: text("severity").notNull().default("warning"),
  message: text("message").notNull(),
  details: jsonb("details"),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  autoTriggered: boolean("auto_triggered").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlatformAlertSchema = createInsertSchema(platformAlerts).omit({ id: true, createdAt: true });
export type PlatformAlert = typeof platformAlerts.$inferSelect;
export type InsertPlatformAlert = z.infer<typeof insertPlatformAlertSchema>;

export const complianceRules = pgTable("compliance_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryCode: text("country_code").notNull(),
  countryName: text("country_name").notNull(),
  category: text("category").notNull(),
  ruleKey: text("rule_key").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  sourceUrl: text("source_url"),
  aiSummary: text("ai_summary"),
  affectedModules: text("affected_modules").array(),
  featureFlags: jsonb("feature_flags").$type<Record<string, boolean>>(),
  status: text("status").notNull().default("pending_approval"),
  severity: text("severity").notNull().default("medium"),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  effectiveDate: timestamp("effective_date"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertComplianceRuleSchema = createInsertSchema(complianceRules).omit({ id: true, createdAt: true, updatedAt: true });
export type ComplianceRule = typeof complianceRules.$inferSelect;
export type InsertComplianceRule = z.infer<typeof insertComplianceRuleSchema>;

export const complianceAuditLog = pgTable("compliance_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action").notNull(),
  ruleId: varchar("rule_id"),
  countryCode: text("country_code"),
  performedBy: varchar("performed_by"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertComplianceAuditSchema = createInsertSchema(complianceAuditLog).omit({ id: true, createdAt: true });
export type ComplianceAudit = typeof complianceAuditLog.$inferSelect;
export type InsertComplianceAudit = z.infer<typeof insertComplianceAuditSchema>;

export const complianceNotifications = pgTable("compliance_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  countryCode: text("country_code"),
  ruleId: varchar("rule_id"),
  targetAudience: text("target_audience").notNull().default("founder"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertComplianceNotificationSchema = createInsertSchema(complianceNotifications).omit({ id: true, createdAt: true });
export type ComplianceNotification = typeof complianceNotifications.$inferSelect;
export type InsertComplianceNotification = z.infer<typeof insertComplianceNotificationSchema>;

export const ecoEfficiencyMetrics = pgTable("eco_efficiency_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricType: text("metric_type").notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  savings: real("savings"),
  recommendation: text("recommendation"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEcoEfficiencySchema = createInsertSchema(ecoEfficiencyMetrics).omit({ id: true, createdAt: true });
export type EcoEfficiencyMetric = typeof ecoEfficiencyMetrics.$inferSelect;
export type InsertEcoEfficiencyMetric = z.infer<typeof insertEcoEfficiencySchema>;

// ============ ADAPTIVE POLICY & CONTENT GOVERNANCE ============

export const policyTemplates = pgTable("policy_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  currentContent: text("current_content").notNull().default(""),
  currentVersion: integer("current_version").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(false),
  lastPublishedAt: timestamp("last_published_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPolicyTemplateSchema = createInsertSchema(policyTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type PolicyTemplate = typeof policyTemplates.$inferSelect;
export type InsertPolicyTemplate = z.infer<typeof insertPolicyTemplateSchema>;

export const policyDrafts = pgTable("policy_drafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull(),
  title: text("title").notNull(),
  draftContent: text("draft_content").notNull(),
  previousContent: text("previous_content").notNull().default(""),
  changeReason: text("change_reason").notNull(),
  changeSummary: text("change_summary"),
  diffHtml: text("diff_html"),
  triggerType: text("trigger_type").notNull(),
  triggerDetails: jsonb("trigger_details"),
  status: text("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  notificationSent: boolean("notification_sent").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPolicyDraftSchema = createInsertSchema(policyDrafts).omit({ id: true, createdAt: true });
export type PolicyDraft = typeof policyDrafts.$inferSelect;
export type InsertPolicyDraft = z.infer<typeof insertPolicyDraftSchema>;

export const policyVersions = pgTable("policy_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull(),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  changeSummary: text("change_summary"),
  changeReason: text("change_reason"),
  publishedBy: text("published_by"),
  publishedAt: timestamp("published_at").defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertPolicyVersionSchema = createInsertSchema(policyVersions).omit({ id: true, publishedAt: true });
export type PolicyVersion = typeof policyVersions.$inferSelect;
export type InsertPolicyVersion = z.infer<typeof insertPolicyVersionSchema>;

// ============ SUPPORT TICKET SYSTEM ============

export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  userEmail: text("user_email").notNull(),
  userName: text("user_name").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("general"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("OPEN"),
  assignedTo: text("assigned_to"),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true, updatedAt: true });
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;

export const ticketMessages = pgTable("ticket_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull(),
  senderType: text("sender_type").notNull(),
  senderName: text("sender_name").notNull(),
  content: text("content").notNull(),
  isAiGenerated: boolean("is_ai_generated").notNull().default(false),
  emailSent: boolean("email_sent").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTicketMessageSchema = createInsertSchema(ticketMessages).omit({ id: true, createdAt: true });
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type InsertTicketMessage = z.infer<typeof insertTicketMessageSchema>;

// ============ ZERO-SUPPORT LEARNING SYSTEM ============

export const knowledgeBaseArticles = pgTable("knowledge_base_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  category: text("category").notNull().default("general"),
  intent: text("intent").notNull().default("information"),
  problem: text("problem").notNull(),
  solution: text("solution").notNull(),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  sourceTicketIds: text("source_ticket_ids").array().default(sql`'{}'::text[]`),
  status: text("status").notNull().default("draft"),
  helpfulCount: integer("helpful_count").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0),
  autoGenerated: boolean("auto_generated").notNull().default(true),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertKBArticleSchema = createInsertSchema(knowledgeBaseArticles).omit({ id: true, createdAt: true, updatedAt: true });
export type KBArticle = typeof knowledgeBaseArticles.$inferSelect;
export type InsertKBArticle = z.infer<typeof insertKBArticleSchema>;

export const ticketSolutions = pgTable("ticket_solutions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull(),
  problem: text("problem").notNull(),
  solution: text("solution").notNull(),
  category: text("category").notNull(),
  intent: text("intent").notNull(),
  confidence: real("confidence").notNull().default(0),
  kbArticleId: varchar("kb_article_id"),
  extractedAt: timestamp("extracted_at").defaultNow(),
});

export const insertTicketSolutionSchema = createInsertSchema(ticketSolutions).omit({ id: true, extractedAt: true });
export type TicketSolution = typeof ticketSolutions.$inferSelect;
export type InsertTicketSolution = z.infer<typeof insertTicketSolutionSchema>;

// ============ AUTONOMOUS OPERATIONS STACK ============

export const opsEngineSnapshots = pgTable("ops_engine_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  engine: text("engine").notNull(),
  status: text("status").notNull().default("healthy"),
  score: real("score").notNull().default(100),
  metrics: text("metrics").notNull().default("{}"),
  actionsCount: integer("actions_count").notNull().default(0),
  alertsCount: integer("alerts_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOpsSnapshotSchema = createInsertSchema(opsEngineSnapshots).omit({ id: true, createdAt: true });
export type OpsEngineSnapshot = typeof opsEngineSnapshots.$inferSelect;
export type InsertOpsEngineSnapshot = z.infer<typeof insertOpsSnapshotSchema>;

export const opsActions = pgTable("ops_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  engine: text("engine").notNull(),
  actionType: text("action_type").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull().default("info"),
  status: text("status").notNull().default("pending"),
  metadata: text("metadata").notNull().default("{}"),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOpsActionSchema = createInsertSchema(opsActions).omit({ id: true, createdAt: true });
export type OpsAction = typeof opsActions.$inferSelect;
export type InsertOpsAction = z.infer<typeof insertOpsActionSchema>;

export const marketingArticles = pgTable("marketing_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  content: text("content").notNull(),
  metaDescription: text("meta_description"),
  keywords: text("keywords").array(),
  category: text("category").notNull().default("insight"),
  status: text("status").notNull().default("draft"),
  views: integer("views").notNull().default(0),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMarketingArticleSchema = createInsertSchema(marketingArticles).omit({ id: true, views: true, createdAt: true });
export type MarketingArticle = typeof marketingArticles.$inferSelect;
export type InsertMarketingArticle = z.infer<typeof insertMarketingArticleSchema>;

export const seoPages = pgTable("seo_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  referenceId: text("reference_id"),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  content: text("content").notNull(),
  metaDescription: text("meta_description"),
  keywords: text("keywords").array(),
  indexed: boolean("indexed").notNull().default(false),
  views: integer("views").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSeoPageSchema = createInsertSchema(seoPages).omit({ id: true, views: true, createdAt: true });
export type SeoPage = typeof seoPages.$inferSelect;
export type InsertSeoPage = z.infer<typeof insertSeoPageSchema>;

export const referralLinks = pgTable("referral_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  code: text("code").notNull().unique(),
  clicks: integer("clicks").notNull().default(0),
  conversions: integer("conversions").notNull().default(0),
  lastClickedAt: timestamp("last_clicked_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReferralLinkSchema = createInsertSchema(referralLinks).omit({ id: true, clicks: true, conversions: true, createdAt: true });
export type ReferralLink = typeof referralLinks.$inferSelect;
export type InsertReferralLink = z.infer<typeof insertReferralLinkSchema>;

export const devOrders = pgTable("dev_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  appName: text("app_name").notNull(),
  appDescription: text("app_description").notNull(),
  requirements: text("requirements"),
  basePrice: real("base_price").notNull().default(200),
  computedExpenses: real("computed_expenses").notNull().default(0),
  marginPercent: real("margin_percent").notNull().default(50),
  finalPrice: real("final_price").notNull(),
  reservedFunds: real("reserved_funds").notNull().default(0),
  paymentStatus: text("payment_status").notNull().default("pending"),
  paymentReference: text("payment_reference"),
  stage: text("stage").notNull().default("QUEUED"),
  deliveryEstimateDays: integer("delivery_estimate_days").notNull().default(5),
  deliveryDeadline: timestamp("delivery_deadline"),
  stageHistory: text("stage_history").notNull().default("[]"),
  founderNotes: text("founder_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDevOrderSchema = createInsertSchema(devOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type DevOrder = typeof devOrders.$inferSelect;
export type InsertDevOrder = z.infer<typeof insertDevOrderSchema>;

export const knowledgePages = pgTable("knowledge_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topicSlug: text("topic_slug").notNull(),
  clusterId: varchar("cluster_id"),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content").notNull(),
  summary: text("summary"),
  keyTakeaways: text("key_takeaways").array(),
  faqItems: jsonb("faq_items").$type<{ question: string; answer: string }[]>(),
  howToSteps: jsonb("how_to_steps").$type<{ name: string; text: string }[]>(),
  schemaMarkupTypes: text("schema_markup_types").array(),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  keywords: text("keywords").array(),
  relatedToolIds: text("related_tool_ids").array(),
  relatedPageIds: text("related_page_ids").array(),
  citationCount: integer("citation_count").notNull().default(0),
  views: integer("views").notNull().default(0),
  updateCount: integer("update_count").notNull().default(0),
  lastUpdatedWithInsight: timestamp("last_updated_with_insight"),
  indexed: boolean("indexed").notNull().default(false),
  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertKnowledgePageSchema = createInsertSchema(knowledgePages).omit({ id: true, citationCount: true, views: true, updateCount: true, createdAt: true, updatedAt: true });
export type KnowledgePage = typeof knowledgePages.$inferSelect;
export type InsertKnowledgePage = z.infer<typeof insertKnowledgePageSchema>;

export const topicClusters = pgTable("topic_clusters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  pillarPageId: varchar("pillar_page_id"),
  topicSlugs: text("topic_slugs").array(),
  description: text("description"),
  totalPages: integer("total_pages").notNull().default(0),
  avgCitationScore: real("avg_citation_score").notNull().default(0),
  domainAuthority: real("domain_authority").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTopicClusterSchema = createInsertSchema(topicClusters).omit({ id: true, totalPages: true, avgCitationScore: true, domainAuthority: true, createdAt: true, updatedAt: true });
export type TopicCluster = typeof topicClusters.$inferSelect;
export type InsertTopicCluster = z.infer<typeof insertTopicClusterSchema>;

export const authorityFlywheelSnapshots = pgTable("authority_flywheel_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  authorityIndex: real("authority_index").notNull().default(0),
  flywheelStatus: text("flywheel_status").notNull().default("Starting"),
  knowledgePageCount: integer("knowledge_page_count").notNull().default(0),
  publishedAppCount: integer("published_app_count").notNull().default(0),
  activeCreatorCount: integer("active_creator_count").notNull().default(0),
  organicTrafficScore: real("organic_traffic_score").notNull().default(0),
  contentUpdateFrequency: real("content_update_frequency").notNull().default(0),
  indexedPageCount: integer("indexed_page_count").notNull().default(0),
  totalCitations: integer("total_citations").notNull().default(0),
  totalViews: integer("total_views").notNull().default(0),
  seoPageCount: integer("seo_page_count").notNull().default(0),
  articleCount: integer("article_count").notNull().default(0),
  clusterCount: integer("cluster_count").notNull().default(0),
  velocityScore: real("velocity_score").notNull().default(0),
  metrics: jsonb("metrics").$type<Record<string, number>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuthorityFlywheelSnapshotSchema = createInsertSchema(authorityFlywheelSnapshots).omit({ id: true, createdAt: true });
export type AuthorityFlywheelSnapshot = typeof authorityFlywheelSnapshots.$inferSelect;
export type InsertAuthorityFlywheelSnapshot = z.infer<typeof insertAuthorityFlywheelSnapshotSchema>;

export const bondscoreTests = pgTable("bondscore_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  slug: text("slug").notNull().unique(),
  coverEmoji: text("cover_emoji").default("🔗"),
  isPublished: boolean("is_published").notNull().default(false),
  participantCount: integer("participant_count").notNull().default(0),
  avgScore: real("avg_score").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bondscoreQuestions = pgTable("bondscore_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  testId: varchar("test_id").notNull(),
  questionText: text("question_text").notNull(),
  orderIndex: integer("order_index").notNull(),
  answers: jsonb("answers").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
});

export const bondscoreAttempts = pgTable("bondscore_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  testId: varchar("test_id").notNull(),
  guestId: text("guest_id"),
  userId: varchar("user_id"),
  score: integer("score"),
  totalQuestions: integer("total_questions").notNull().default(10),
  shareId: text("share_id").notNull().unique(),
  selectedAnswers: jsonb("selected_answers").$type<number[]>().notNull(),
  completed: boolean("completed").notNull().default(false),
  claimed: boolean("claimed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBondscoreTestSchema = createInsertSchema(bondscoreTests).omit({ id: true, participantCount: true, avgScore: true, createdAt: true });
export const insertBondscoreQuestionSchema = createInsertSchema(bondscoreQuestions).omit({ id: true });
export const insertBondscoreAttemptSchema = createInsertSchema(bondscoreAttempts).omit({ id: true, createdAt: true });
export type BondscoreTest = typeof bondscoreTests.$inferSelect;
export type BondscoreQuestion = typeof bondscoreQuestions.$inferSelect;
export type BondscoreAttempt = typeof bondscoreAttempts.$inferSelect;
export type InsertBondscoreTest = z.infer<typeof insertBondscoreTestSchema>;
export type InsertBondscoreQuestion = z.infer<typeof insertBondscoreQuestionSchema>;
export type InsertBondscoreAttempt = z.infer<typeof insertBondscoreAttemptSchema>;

export const inevitablePlatformSnapshots = pgTable("inevitable_platform_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inevitabilityIndex: real("inevitability_index").notNull().default(0),
  platformStage: text("platform_stage").notNull().default("Early Platform"),
  creatorRetentionRate: real("creator_retention_rate").notNull().default(0),
  organicAcquisitionRate: real("organic_acquisition_rate").notNull().default(0),
  knowledgeGrowthRate: real("knowledge_growth_rate").notNull().default(0),
  marketplaceTransactionCount: integer("marketplace_transaction_count").notNull().default(0),
  userReturnFrequency: real("user_return_frequency").notNull().default(0),
  totalCreators: integer("total_creators").notNull().default(0),
  returningUsers: integer("returning_users").notNull().default(0),
  newUsersThisWeek: integer("new_users_this_week").notNull().default(0),
  knowledgePageTotal: integer("knowledge_page_total").notNull().default(0),
  marketplaceRevenue: real("marketplace_revenue").notNull().default(0),
  velocityScore: real("velocity_score").notNull().default(0),
  metrics: jsonb("metrics").$type<Record<string, number>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInevitablePlatformSnapshotSchema = createInsertSchema(inevitablePlatformSnapshots).omit({ id: true, createdAt: true });
export type InevitablePlatformSnapshot = typeof inevitablePlatformSnapshots.$inferSelect;
export type InsertInevitablePlatformSnapshot = z.infer<typeof insertInevitablePlatformSnapshotSchema>;

export const sdhAccounts = pgTable("sdh_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  platform: text("platform").notNull(),
  accountName: text("account_name").notNull(),
  accountHandle: text("account_handle"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  isActive: boolean("is_active").notNull().default(true),
  lastPostedAt: timestamp("last_posted_at"),
  postCount: integer("post_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sdhPosts = pgTable("sdh_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").notNull(),
  platform: text("platform").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),
  sourceUrl: text("source_url"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  hashtags: text("hashtags").array(),
  imageUrl: text("image_url"),
  postUrl: text("post_url"),
  status: text("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  engagement: integer("engagement").notNull().default(0),
  errorMessage: text("error_message"),
  qualityScore: real("quality_score").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sdhConfig = pgTable("sdh_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postsPerDay: integer("posts_per_day").notNull().default(3),
  minQualityScore: real("min_quality_score").notNull().default(0.6),
  autoPost: boolean("auto_post").notNull().default(false),
  includeImages: boolean("include_images").notNull().default(true),
  platforms: text("platforms").array(),
  contentTypes: text("content_types").array(),
  postingStartHour: integer("posting_start_hour").notNull().default(9),
  postingEndHour: integer("posting_end_hour").notNull().default(21),
  timezone: text("timezone").notNull().default("UTC"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSdhAccountSchema = createInsertSchema(sdhAccounts).omit({ id: true, postCount: true, createdAt: true, lastPostedAt: true });
export const insertSdhPostSchema = createInsertSchema(sdhPosts).omit({ id: true, impressions: true, clicks: true, engagement: true, createdAt: true });
export type SdhAccount = typeof sdhAccounts.$inferSelect;
export type SdhPost = typeof sdhPosts.$inferSelect;
export type SdhConfig = typeof sdhConfig.$inferSelect;
export type InsertSdhAccount = z.infer<typeof insertSdhAccountSchema>;
export type InsertSdhPost = z.infer<typeof insertSdhPostSchema>;

// ---- Growth Autopilot Stack ----

export const growthAutopilotConfig = pgTable("growth_autopilot_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contentEngineEnabled: boolean("content_engine_enabled").notNull().default(false),
  socialDistEnabled: boolean("social_dist_enabled").notNull().default(false),
  viralEngineEnabled: boolean("viral_engine_enabled").notNull().default(false),
  emailAutomationEnabled: boolean("email_automation_enabled").notNull().default(false),
  aiOptimizerEnabled: boolean("ai_optimizer_enabled").notNull().default(false),
  seoAutoGenerate: boolean("seo_auto_generate").notNull().default(false),
  seoAutoUpdate: boolean("seo_auto_update").notNull().default(false),
  socialAutoSchedule: boolean("social_auto_schedule").notNull().default(false),
  viralAutoPromote: boolean("viral_auto_promote").notNull().default(false),
  emailDigestFrequency: text("email_digest_frequency").notNull().default("weekly"),
  optimizerRunFrequency: text("optimizer_run_frequency").notNull().default("daily"),
  lastCycleAt: timestamp("last_cycle_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const growthEmailTriggers = pgTable("growth_email_triggers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  triggerType: text("trigger_type").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  subjectTemplate: text("subject_template").notNull(),
  bodyTemplate: text("body_template").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  triggerCount: integer("trigger_count").notNull().default(0),
  lastTriggeredAt: timestamp("last_triggered_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const growthAutopilotLogs = pgTable("growth_autopilot_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  system: text("system").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  result: text("result").notNull().default("success"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const growthOptimizationInsights = pgTable("growth_optimization_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  insightType: text("insight_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  recommendation: text("recommendation").notNull(),
  impact: text("impact").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  metrics: jsonb("metrics").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGrowthEmailTriggerSchema = createInsertSchema(growthEmailTriggers).omit({ id: true, triggerCount: true, lastTriggeredAt: true, createdAt: true });
export type GrowthAutopilotConfig = typeof growthAutopilotConfig.$inferSelect;
export type GrowthEmailTrigger = typeof growthEmailTriggers.$inferSelect;
export type GrowthAutopilotLog = typeof growthAutopilotLogs.$inferSelect;
export type GrowthOptimizationInsight = typeof growthOptimizationInsights.$inferSelect;
export type InsertGrowthEmailTrigger = z.infer<typeof insertGrowthEmailTriggerSchema>;

// === Projects & Pipeline Tables ===

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  debateId: integer("debate_id"),
  topicSlug: text("topic_slug"),
  title: text("title").notNull(),
  description: text("description"),
  projectType: text("project_type").notNull().default("general"),
  status: text("status").notNull().default("draft"),
  blueprintJson: jsonb("blueprint_json").$type<Record<string, any>>(),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projectPackages = pgTable("project_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  pdfUrl: text("pdf_url"),
  pages: integer("pages").notNull().default(0),
  councilApproved: boolean("council_approved").notNull().default(false),
  versionNumber: integer("version_number").notNull().default(1),
  generatedAt: timestamp("generated_at").defaultNow(),
});

export const projectAgentContributions = pgTable("project_agent_contributions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  agentId: varchar("agent_id").notNull(),
  role: text("role").notNull().default("contributor"),
  contributionWeight: real("contribution_weight").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projectPackagePurchases = pgTable("project_package_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectPackageId: varchar("project_package_id").notNull(),
  buyerId: varchar("buyer_id").notNull(),
  amount: integer("amount").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projectValidations = pgTable("project_validations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  projectPackageId: varchar("project_package_id").notNull(),
  feasibilityScore: integer("feasibility_score").notNull(),
  marketDemandScore: integer("market_demand_score").notNull(),
  usefulnessScore: integer("usefulness_score").notNull(),
  innovationScore: integer("innovation_score").notNull(),
  riskLevel: text("risk_level").notNull(),
  estimatedAudienceRange: text("estimated_audience_range"),
  reasoningSummary: text("reasoning_summary"),
  recommendation: text("recommendation").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projectFeedback = pgTable("project_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectPackageId: varchar("project_package_id").notNull(),
  buyerId: varchar("buyer_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  triggersRevision: boolean("triggers_revision").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, version: true, createdAt: true, updatedAt: true });
export const insertProjectPackageSchema = createInsertSchema(projectPackages).omit({ id: true, generatedAt: true });
export const insertProjectAgentContributionSchema = createInsertSchema(projectAgentContributions).omit({ id: true, createdAt: true });
export const insertProjectPackagePurchaseSchema = createInsertSchema(projectPackagePurchases).omit({ id: true, createdAt: true });
export const insertProjectValidationSchema = createInsertSchema(projectValidations).omit({ id: true, createdAt: true });
export const insertProjectFeedbackSchema = createInsertSchema(projectFeedback).omit({ id: true, createdAt: true });

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type ProjectPackage = typeof projectPackages.$inferSelect;
export type InsertProjectPackage = z.infer<typeof insertProjectPackageSchema>;
export type ProjectAgentContribution = typeof projectAgentContributions.$inferSelect;
export type InsertProjectAgentContribution = z.infer<typeof insertProjectAgentContributionSchema>;
export type ProjectPackagePurchase = typeof projectPackagePurchases.$inferSelect;
export type InsertProjectPackagePurchase = z.infer<typeof insertProjectPackagePurchaseSchema>;
export type ProjectValidation = typeof projectValidations.$inferSelect;
export type InsertProjectValidation = z.infer<typeof insertProjectValidationSchema>;
export type ProjectFeedback = typeof projectFeedback.$inferSelect;
export type InsertProjectFeedback = z.infer<typeof insertProjectFeedbackSchema>;

// ===========================================================================
// AI Jobs — durable persistence for the TS↔Python worker bridge.
// Mirrors the wire contracts in shared/aiJobContracts.ts, which in turn mirror
// python-workers/shared/contracts.py. Used by server/services/aiJobService.ts.
// ===========================================================================
export const aiJobs = pgTable("ai_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobType: text("job_type").notNull(),
  origin: text("origin").notNull(),
  status: text("status").notNull().default("pending"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  result: jsonb("result").$type<Record<string, unknown>>(),
  error: text("error"),
  provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull(),
  requestedByUserId: varchar("requested_by_user_id"),
  requestedByAdminId: varchar("requested_by_admin_id"),
  requestId: text("request_id"),
  priority: integer("priority").notNull().default(0),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  lockedAt: timestamp("locked_at"),
  lockedBy: text("locked_by"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  failedAt: timestamp("failed_at"),
  durationMs: integer("duration_ms"),
  metrics: jsonb("metrics").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_ai_jobs_status_created").on(table.status, table.createdAt),
  index("IDX_ai_jobs_user").on(table.requestedByUserId),
  index("IDX_ai_jobs_admin").on(table.requestedByAdminId),
]);

export type AiJob = typeof aiJobs.$inferSelect;

// ---------------------------------------------------------------------------
// AI job audit events
// ---------------------------------------------------------------------------
// Durable append-only log of lifecycle events for every row in ai_jobs.
// Written by aiJobService at job-creation / claim / completion / retry /
// cancel / stale-detection time. Admin-only audit surface — never exposed
// to normal users in aggregate.
export const aiJobEvents = pgTable("ai_job_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(),
  eventType: text("event_type").notNull(),
  actorType: text("actor_type").notNull(),
  actorUserId: varchar("actor_user_id"),
  actorAdminId: varchar("actor_admin_id"),
  actorWorkerId: text("actor_worker_id"),
  previousStatus: text("previous_status"),
  newStatus: text("new_status"),
  message: text("message"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_ai_job_events_job_created").on(table.jobId, table.createdAt),
  index("IDX_ai_job_events_type_created").on(table.eventType, table.createdAt),
]);

export type AiJobEvent = typeof aiJobEvents.$inferSelect;

export const aiWorkers = pgTable("ai_workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: text("worker_id").notNull().unique(),
  status: text("status").notNull().default("offline"),
  hostname: text("hostname"),
  processId: text("process_id"),
  version: text("version"),
  capabilities: jsonb("capabilities").$type<string[]>().default([]),
  currentJobId: varchar("current_job_id"),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  jobsClaimedCount: integer("jobs_claimed_count").notNull().default(0),
  jobsSucceededCount: integer("jobs_succeeded_count").notNull().default(0),
  jobsFailedCount: integer("jobs_failed_count").notNull().default(0),
  lastError: text("last_error"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_ai_workers_last_seen").on(table.lastSeenAt),
  index("IDX_ai_workers_status").on(table.status),
]);

export type AiWorker = typeof aiWorkers.$inferSelect;

export const aiRetentionRuns = pgTable("ai_retention_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull().unique(),
  adminId: varchar("admin_id"),
  dryRun: boolean("dry_run").notNull(),
  policy: jsonb("policy").$type<Record<string, number>>().notNull(),
  eligibleCounts: jsonb("eligible_counts").$type<Record<string, number>>().notNull(),
  deletedCounts: jsonb("deleted_counts").$type<Record<string, number>>(),
  status: text("status").notNull().default("started"),
  error: text("error"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_ai_retention_runs_created_at").on(table.createdAt),
  index("IDX_ai_retention_runs_admin_id").on(table.adminId),
  index("IDX_ai_retention_runs_dry_run").on(table.dryRun),
  index("IDX_ai_retention_runs_status").on(table.status),
]);

export type AiRetentionRun = typeof aiRetentionRuns.$inferSelect;

// AI ops daily snapshots — admin-captured historical view of the
// summary metrics so trends can be inspected later. Stores compact
// aggregates only; no raw payloads / secrets.
export const aiOpsSnapshots = pgTable("ai_ops_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotId: varchar("snapshot_id").notNull().unique(),
  snapshotDate: text("snapshot_date").notNull().unique(),
  generatedByAdminId: varchar("generated_by_admin_id"),
  healthStatus: text("health_status").notNull(),
  healthReasons: jsonb("health_reasons").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  jobMetrics: jsonb("job_metrics").$type<Record<string, number>>().notNull(),
  workerMetrics: jsonb("worker_metrics").$type<Record<string, number>>().notNull(),
  retentionMetrics: jsonb("retention_metrics").$type<Record<string, unknown>>().notNull(),
  notificationMetrics: jsonb("notification_metrics").$type<Record<string, number>>(),
  rawSummary: jsonb("raw_summary").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_ai_ops_snapshots_snapshot_date").on(table.snapshotDate),
  index("IDX_ai_ops_snapshots_health_status").on(table.healthStatus),
  index("IDX_ai_ops_snapshots_admin_id").on(table.generatedByAdminId),
  index("IDX_ai_ops_snapshots_created_at").on(table.createdAt),
]);

export type AiOpsSnapshot = typeof aiOpsSnapshots.$inferSelect;

// Audit trail for admin CSV exports. Records who downloaded what,
// with which filters, how many rows. Does NOT store the CSV bytes.
export const aiExportEvents = pgTable("ai_export_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  exportId: varchar("export_id").notNull().unique(),
  exportType: text("export_type").notNull(),
  adminId: varchar("admin_id"),
  filters: jsonb("filters").$type<Record<string, unknown>>(),
  rowCount: integer("row_count").notNull().default(0),
  filename: text("filename").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_ai_export_events_created_at").on(table.createdAt),
  index("IDX_ai_export_events_admin_id").on(table.adminId),
  index("IDX_ai_export_events_export_type").on(table.exportType),
  index("IDX_ai_export_events_status").on(table.status),
]);

export type AiExportEvent = typeof aiExportEvents.$inferSelect;

// --- T6 Newsroom Broadcast Compositor -----------------------------------
// One row per rendered broadcast MP4. `packageId` / `brollPlanId` are
// stored as text refs (not hard FKs) because the upstream tables
// (T2 source registry, T4 broll plan) live in sibling modules and are
// being landed across the Newsroom T-series tasks.
export type BroadcastManifest = {
  schemaVersion: 1;
  packageId: string;
  brollPlanId: string | null;
  anchorVideoUrl: string | null;
  mp4Filename: string;
  dryRun: boolean;
  generatedAt: string;
  generatedBy: string;
  canvas: { width: number; height: number; fps: number; durationSec: number };
  layers: string[];
  headline: string;
  kicker: string;
  confidence: { level: "high" | "medium" | "low"; score: number };
  sources: Array<{
    name: string;
    url: string | null;
    license: string;
    attribution: string | null;
    tier: string | null;
  }>;
  safety: {
    publicPublishing: false;
    youtubeUpload: false;
    socialPosting: false;
    externalUpload: false;
    requiresFounderApprovalForLive: true;
  };
};

export const broadcasts = pgTable("broadcasts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packageId: text("package_id").notNull(),
  brollPlanId: text("broll_plan_id"),
  anchorVideoUrl: text("anchor_video_url"),
  mp4Path: text("mp4_path").notNull(),
  manifestPath: text("manifest_path").notNull(),
  manifestJson: jsonb("manifest_json").$type<BroadcastManifest>().notNull(),
  status: text("status").notNull().default("rendered"),
  dryRun: boolean("dry_run").notNull().default(true),
  title: text("title"),
  coverImageUrl: text("cover_image_url"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_broadcasts_package_id").on(table.packageId),
  index("IDX_broadcasts_created_at").on(table.createdAt),
]);

export const insertBroadcastSchema = createInsertSchema(broadcasts).omit({ id: true, createdAt: true });
export type InsertBroadcast = z.infer<typeof insertBroadcastSchema>;
export type Broadcast = typeof broadcasts.$inferSelect;

// Server-owned approval registry. The broadcast render route must look up
// approval state here — never trust a client-supplied `packageApproved`
// field. Rows are inserted only by root admin via the approvals route.
export const broadcastPackageApprovals = pgTable("broadcast_package_approvals", {
  packageId: text("package_id").primaryKey(),
  approvedBy: varchar("approved_by").notNull(),
  approvedAt: timestamp("approved_at").notNull().defaultNow(),
  reason: text("reason"),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by"),
});

export type BroadcastPackageApproval = typeof broadcastPackageApprovals.$inferSelect;

// Audit log of live-broadcast alert state transitions. One row is written
// when the live count crosses above the configured threshold ("triggered"),
// and another when it falls back to/below the threshold ("cleared"). This
// powers the "Recent live alerts" panel on the Broadcast Compositor page
// so admins can post-incident-review brief alert flaps that auto-resolved.
export const broadcastLiveAlertEvents = pgTable("broadcast_live_alert_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: text("kind").notNull(), // 'triggered' | 'cleared'
  liveCount: integer("live_count").notNull(),
  threshold: integer("threshold").notNull(),
  recordedBy: varchar("recorded_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_broadcast_live_alert_events_created_at").on(table.createdAt),
]);

export type BroadcastLiveAlertEvent = typeof broadcastLiveAlertEvents.$inferSelect;

// Per-admin saved filter views (e.g., for BroadcastPreview filters). Stored
// server-side so views follow the admin across browsers/devices. `payload`
// is an opaque JSON blob whose shape is validated client-side per `scope`.
export const adminFilterViews = pgTable("admin_filter_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(),
  scope: text("scope").notNull(),
  name: text("name").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_admin_filter_views_owner_scope").on(table.ownerId, table.scope),
]);

export const insertAdminFilterViewSchema = createInsertSchema(adminFilterViews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdminFilterView = z.infer<typeof insertAdminFilterViewSchema>;
export type AdminFilterView = typeof adminFilterViews.$inferSelect;

// ---------------------------------------------------------------------------
// Newsroom T4 — Legal B-Roll Resolver
// ---------------------------------------------------------------------------
// `broll_clips`  — cache of license-tagged B-roll candidates by source/query.
// `broll_plans`  — per-brief resolved plan with per-beat clip assignments.
//
// SAFETY:
//   - Every cached clip carries an explicit licenseStatus + licenseTier.
//     The resolver and adapters reject any candidate missing this metadata,
//     and the safety harness asserts licensed media before a plan is built.
//   - Cost-bearing adapters (Pexels, Pixabay, Mapbox, Runway) default to
//     DRY_RUN. Live API calls require an explicit founder env flag.
//   - URLs from a hard-coded copyrighted-source blocklist (CNN, Reuters,
//     AP, BBC, etc.) are dropped at the adapter layer even if license-tagged.
export const brollClips = pgTable("broll_clips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: text("source").notNull(),
  externalId: text("external_id").notNull(),
  query: text("query").notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  licenseStatus: text("license_status").notNull(),
  licenseTier: text("license_tier").notNull(),
  attribution: text("attribution").notNull(),
  rightsUrl: text("rights_url"),
  durationSec: integer("duration_sec").notNull().default(0),
  width: integer("width"),
  height: integer("height"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  indexedAt: timestamp("indexed_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("broll_clips_source_external_id_idx").on(table.source, table.externalId),
  index("broll_clips_query_idx").on(table.query),
  index("broll_clips_license_status_idx").on(table.licenseStatus),
]);

export type BrollClip = typeof brollClips.$inferSelect;
export const insertBrollClipSchema = createInsertSchema(brollClips).omit({ id: true, indexedAt: true });
export type InsertBrollClip = z.infer<typeof insertBrollClipSchema>;

export const brollPlans = pgTable("broll_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  briefId: text("brief_id").notNull(),
  beats: jsonb("beats").$type<Array<{
    beatId: string;
    query: string;
    durationSec: number;
    clipId: string | null;
    source: string | null;
    licenseStatus: string | null;
    licenseTier: string | null;
    attribution: string | null;
    rightsUrl: string | null;
    url: string | null;
    tierTried: string[];
    rejected: Array<{ source: string; reason: string }>;
  }>>().notNull().default([]),
  totalDurationSec: integer("total_duration_sec").notNull().default(0),
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("broll_plans_brief_id_idx").on(table.briefId),
  index("broll_plans_status_idx").on(table.status),
]);

export type BrollPlan = typeof brollPlans.$inferSelect;
export const insertBrollPlanSchema = createInsertSchema(brollPlans).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBrollPlan = z.infer<typeof insertBrollPlanSchema>;

// T9 — Shorts Cutter (approval-gated social drafts).
// Outputs from the Shorts Cutter land here with status='draft'. Approval
// flips approved=true; it does NOT post to any external platform.
export const SOCIAL_DRAFT_PLATFORMS = ["youtube_shorts", "instagram_reels", "tiktok"] as const;
export const SOCIAL_DRAFT_ASPECT_RATIOS = ["9:16", "1:1", "4:5"] as const;
export const SOCIAL_DRAFT_STATUSES = ["draft", "approved", "discarded"] as const;

export const socialDrafts = pgTable("social_drafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  broadcastId: varchar("broadcast_id").notNull().references(() => broadcasts.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  aspectRatio: text("aspect_ratio").notNull(),
  durationSec: integer("duration_sec").notNull(),
  clipPath: text("clip_path").notNull(),
  caption: text("caption").notNull().default(""),
  thumbnailPath: text("thumbnail_path"),
  hashtags: text("hashtags").array().notNull().default(sql`ARRAY[]::text[]`),
  suggestedPostAt: timestamp("suggested_post_at"),
  lastCropRect: jsonb("last_crop_rect").$type<{
    nx: number;
    ny: number;
    nw: number;
    nh: number;
    sourceWidth: number;
    sourceHeight: number;
  } | null>(),
  status: text("status").notNull().default("draft"),
  approved: boolean("approved").notNull().default(false),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_social_drafts_broadcast_id").on(table.broadcastId),
  index("IDX_social_drafts_status").on(table.status),
  index("IDX_social_drafts_created_at").on(table.createdAt),
]);

export const insertSocialDraftSchema = createInsertSchema(socialDrafts).omit({
  id: true,
  createdAt: true,
  approved: true,
  approvedBy: true,
  approvedAt: true,
});
export type InsertSocialDraft = z.infer<typeof insertSocialDraftSchema>;
export type SocialDraft = typeof socialDrafts.$inferSelect;
export type SocialDraftPlatform = typeof SOCIAL_DRAFT_PLATFORMS[number];
export type SocialDraftAspectRatio = typeof SOCIAL_DRAFT_ASPECT_RATIOS[number];
export type SocialDraftStatus = typeof SOCIAL_DRAFT_STATUSES[number];

// T7 — AI Anchor Director: per-beat anchor video clips chosen by the
// director. Stored under PRIVATE_OBJECT_DIR/anchors/. Dry-run by default.
export const anchorClips = pgTable("anchor_clips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  packageId: text("package_id").notNull(),
  beatIndex: integer("beat_index").notNull(),
  mode: text("mode").notNull(),
  presetId: text("preset_id").notNull(),
  clipUrl: text("clip_url"),
  clipPath: text("clip_path"),
  dryRun: boolean("dry_run").notNull().default(true),
  sensitive: boolean("sensitive").notNull().default(false),
  eventType: text("event_type"),
  mood: text("mood"),
  promptPrefix: text("prompt_prefix"),
  framing: text("framing"),
  durationMs: integer("duration_ms").notNull().default(0),
  generationMetadata: jsonb("generation_metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_anchor_clips_package").on(table.packageId),
  index("IDX_anchor_clips_package_beat").on(table.packageId, table.beatIndex),
]);

export const insertAnchorClipSchema = createInsertSchema(anchorClips).omit({ id: true, createdAt: true });
export type InsertAnchorClip = z.infer<typeof insertAnchorClipSchema>;
export type AnchorClip = typeof anchorClips.$inferSelect;

export * from "./models/chat";

/* --------------------------------------------------------------------- */
/* Newsroom T3 — broadcast_briefs                                         */
/*   This table IS migrated (re-exported into the live drizzle schema).   */
/*   Sibling verified_* tables remain migration-gated in                  */
/*   shared/newsroom-schema.ts; the FK is enforced at the application     */
/*   layer (BroadcastBriefBuilderService) and will be hardened to a real  */
/*   DB FK when the verified_knowledge migration ships.                   */
/* --------------------------------------------------------------------- */
export { broadcastBriefs, type BroadcastBriefRow } from "./newsroom-schema";

/* --------------------------------------------------------------------- */
/* Newsroom T5 — newsroom_packages                                        */
/*   This table IS migrated. Soft FK to broadcast_briefs.id (T3) is       */
/*   enforced at the application layer in                                  */
/*   server/services/newsroom-package-builder-service.ts.                 */
/* --------------------------------------------------------------------- */
export { newsroomPackages, type NewsroomPackageRow } from "./newsroom-schema";

/* --------------------------------------------------------------------- */
/* Neural Newsroom Automation + Broadcast-Grade Virtual Screen Director  */
/*   See shared/neural-newsroom-schema.ts. DDL is applied via            */
/*   scripts/migrate-neural-newsroom.ts (direct SQL through              */
/*   SUPABASE_DB_URL) — drizzle-kit push is intentionally not used.      */
/* --------------------------------------------------------------------- */
export {
  screenPresets,
  screenTakePlans,
  screenSafetyValidations,
  SAFETY_ENVELOPE_LOCKED,
  type ScreenPresetRow,
  type ScreenTakePlanRow,
  type ScreenSafetyValidationRow,
  type SafetyEnvelope,
} from "./neural-newsroom-schema";

export {
  audienceChannelConnectors,
  audienceMessages,
  audienceSafetyDecisions,
  audienceModerationCommands,
  audienceAuditEmailSchedules,
  audienceAuditEmailRuns,
  audienceAuditExports,
  audienceConnectorSecrets,
  audienceArchiveDeletions,
  audienceGatewayEvents,
  audienceAuditEmailFailureAlertSnoozes,
  type AudienceAuditEmailFailureAlertSnoozeRow,
  type AudienceChannelConnectorRow,
  type AudienceMessageRow,
  type AudienceSafetyDecisionRow,
  type AudienceModerationCommandRow,
  type AudienceAuditEmailScheduleRow,
  type AudienceAuditEmailRunRow,
  type AudienceAuditExportRow,
  type AudienceArchiveDeletionRow,
  type AudienceAuditExportRecord,
  type AudienceConnectorSecretRow,
  type AudienceConnectorSecretMetadata,
} from "./omni-channel-audience-schema";

/* --------------------------------------------------------------------- */
/* Newsroom T8 — Playout Queue (24/7 channel state)                       */
/*   In-memory orchestration backed by these tables for future            */
/*   persistence. Service layer (server/services/playout-queue-service.ts)*/
/*   currently keeps live state in-process for safety.                    */
/* --------------------------------------------------------------------- */

export const playoutQueue = pgTable("playout_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  broadcastId: varchar("broadcast_id").notNull().references(() => broadcasts.id, { onDelete: "cascade" }),
  region: text("region").notNull().default("GLOBAL"),
  scheduledAt: timestamp("scheduled_at").notNull().defaultNow(),
  ttlSec: integer("ttl_sec").notNull().default(3600),
  status: text("status").notNull().default("queued"),
  breaking: boolean("breaking").notNull().default(false),
  priority: integer("priority").notNull().default(100),
  enqueuedBy: varchar("enqueued_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  ejectedBy: varchar("ejected_by"),
  ejectReason: text("eject_reason"),
}, (table) => [
  index("IDX_playout_queue_status").on(table.status),
  index("IDX_playout_queue_region").on(table.region),
]);

export const playoutHistory = pgTable("playout_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  broadcastId: varchar("broadcast_id").notNull(),
  playedAt: timestamp("played_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  durationSec: integer("duration_sec").notNull().default(0),
  ejectedBy: varchar("ejected_by"),
  reason: text("reason"),
  region: text("region").notNull().default("GLOBAL"),
  breaking: boolean("breaking").notNull().default(false),
}, (table) => [
  index("IDX_playout_history_played_at").on(table.playedAt),
]);

export const playoutState = pgTable("playout_state", {
  id: varchar("id").primaryKey().default("singleton"),
  currentBroadcastId: varchar("current_broadcast_id"),
  currentQueueItemId: varchar("current_queue_item_id"),
  currentStartedAt: timestamp("current_started_at"),
  killSwitchActive: boolean("kill_switch_active").notNull().default(false),
  killSwitchActivatedBy: varchar("kill_switch_activated_by"),
  killSwitchAt: timestamp("kill_switch_at"),
  killSwitchReason: text("kill_switch_reason"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPlayoutQueueSchema = createInsertSchema(playoutQueue).omit({
  id: true,
  createdAt: true,
});
export type InsertPlayoutQueue = z.infer<typeof insertPlayoutQueueSchema>;
export type PlayoutQueueRow = typeof playoutQueue.$inferSelect;
export type PlayoutHistoryRow = typeof playoutHistory.$inferSelect;
export type PlayoutStateRow = typeof playoutState.$inferSelect;

/* --------------------------------------------------------------------- */
/* Newsroom T10 — Cost Control                                            */
/*   `cost_policies` is a singleton row (id='singleton') holding the      */
/*   founder-tunable spend caps, gating thresholds, and the global        */
/*   "pause paid APIs" switch.                                             */
/*                                                                        */
/*   `cost_events` is an append-only audit log of every cost-gate         */
/*   decision (allowed or blocked). The application layer never exposes   */
/*   UPDATE/DELETE for this table — rows are immutable.                   */
/* --------------------------------------------------------------------- */
export const costPolicies = pgTable("cost_policies", {
  id: varchar("id").primaryKey().default("singleton"),
  dailyCapUsd: real("daily_cap_usd").notNull().default(5),
  monthlyCapUsd: real("monthly_cap_usd").notNull().default(100),
  paidApisPaused: boolean("paid_apis_paused").notNull().default(true),
  impactScoreThreshold: integer("impact_score_threshold").notNull().default(70),
  confidenceThreshold: real("confidence_threshold").notNull().default(0.7),
  updatedBy: varchar("updated_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const costEvents = pgTable("cost_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: text("kind").notNull(),
  briefId: text("brief_id"),
  broadcastId: text("broadcast_id"),
  estUsd: real("est_usd").notNull().default(0),
  actualUsd: real("actual_usd").notNull().default(0),
  allowed: boolean("allowed").notNull(),
  reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_cost_events_created_at").on(table.createdAt),
  index("IDX_cost_events_kind").on(table.kind),
]);

export type CostPolicyRow = typeof costPolicies.$inferSelect;
export type CostEventRow = typeof costEvents.$inferSelect;
export const COST_KINDS = [
  "broll_paid",
  "broll_runway",
  "anchor_premium",
  "broadcast_full",
  "shorts_cut",
  "ai_thumbnail",
] as const;
export type CostKind = typeof COST_KINDS[number];

/* --------------------------------------------------------------------- */
/*  Admin: Saved Broadcast Filter Views (T202)                            */
/*  Server-side persistence of "Saved views" from BroadcastPreview so     */
/*  admins can share useful filter combinations with the whole team.      */
/* --------------------------------------------------------------------- */
export const adminBroadcastSavedView = pgTable("admin_broadcast_saved_view", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  scope: text("scope").notNull().default("private"), // "private" | "shared"
  dryRun: text("dry_run").notNull().default("all"),  // "all" | "dry" | "live"
  status: text("status").notNull().default("all"),
  packageId: text("package_id").notNull().default(""),
  isTeamDefault: boolean("is_team_default").notNull().default(false),
  teamDefaultSetByActorId: varchar("team_default_set_by_actor_id"),
  teamDefaultSetByActorType: text("team_default_set_by_actor_type"),
  teamDefaultSetAt: timestamp("team_default_set_at"),
  // T263: Optional schedule that makes this shared view the team default
  // during specific recurring time windows (e.g. business hours vs nights).
  // `enabled=true` and at least one window means the view is eligible to win
  // the first-load auto-apply when "now" falls inside a window. Days use
  // 0=Sunday..6=Saturday. `startMinute`/`endMinute` are minutes since
  // midnight (0..1440); if `endMinute <= startMinute` the window wraps
  // past midnight into the next day. Time is evaluated in the viewer's
  // local timezone (`timezone: "local"`) so a rotation defined as
  // "07:00–19:00 Mon–Fri" lines up with the on-call admin's workday.
  schedule: jsonb("schedule").$type<{
    enabled: boolean;
    timezone: "local";
    windows: Array<{
      days: number[];
      startMinute: number;
      endMinute: number;
    }>;
  } | null>().default(null),
  createdByActorId: varchar("created_by_actor_id").notNull(),
  createdByActorType: text("created_by_actor_type").notNull().default("root_admin"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_admin_broadcast_saved_view_scope").on(table.scope),
  index("IDX_admin_broadcast_saved_view_created_by").on(table.createdByActorId),
  index("IDX_admin_broadcast_saved_view_team_default").on(table.isTeamDefault),
]);

export type AdminBroadcastSavedView = typeof adminBroadcastSavedView.$inferSelect;
export const insertAdminBroadcastSavedViewSchema = createInsertSchema(adminBroadcastSavedView).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdminBroadcastSavedView = z.infer<typeof insertAdminBroadcastSavedViewSchema>;

/* --------------------------------------------------------------------- */
/*  Admin: Team-default fallback filter preset (T310)                     */
/*  Founders can pin a preferred fallback configuration (dryRun/status/   */
/*  packageId) so the "Create new fallback view" form starts there every  */
/*  time, regardless of whatever filters happen to be applied on the      */
/*  dashboard. Singleton — only one row is ever kept (enforced in the     */
/*  app layer by upserting into the same `id = 'singleton'` slot).        */
/* --------------------------------------------------------------------- */
export const adminBroadcastFallbackDefaultPreset = pgTable(
  "admin_broadcast_fallback_default_preset",
  {
    id: varchar("id").primaryKey().default("singleton"),
    dryRun: text("dry_run").notNull().default("all"), // "all" | "dry" | "live"
    status: text("status").notNull().default("all"),
    packageId: text("package_id").notNull().default(""),
    updatedByActorId: varchar("updated_by_actor_id").notNull(),
    updatedByActorType: text("updated_by_actor_type").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);
export type AdminBroadcastFallbackDefaultPreset =
  typeof adminBroadcastFallbackDefaultPreset.$inferSelect;

/* --------------------------------------------------------------------- */
/*  R5C/R5D — Real 3D Asset Library: production_assets table            */
/*  Admin-only catalog of 3D assets (GLB/GLTF) stored in private object  */
/*  storage. Defaults enforce the safety invariants of the R5C plan:     */
/*  status=draft, lifecycleState=uploaded, licenseStatus=unknown,        */
/*  safetyReview=pending, approvalGate=not_approved, publicUrl=null.     */
/*  CHECK constraint enforces publicUrl IS NULL for the R5C phase.       */
/* --------------------------------------------------------------------- */
export const productionAssets = pgTable("production_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  format: text("format").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull().unique(),
  originalSourceUrl: text("original_source_url"),
  storageKey: text("storage_key").notNull(),
  uploaderUserId: text("uploader_user_id").notNull(),
  status: text("status").notNull().default("draft"),
  lifecycleState: text("lifecycle_state").notNull().default("uploaded"),
  licenseStatus: text("license_status").notNull().default("unknown"),
  licenseSource: text("license_source"),
  licenseNote: text("license_note"),
  safetyReview: text("safety_review").notNull().default("pending"),
  safetyNote: text("safety_note"),
  approvalGate: text("approval_gate").notNull().default("not_approved"),
  publicUrl: text("public_url").default(sql`NULL`),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_production_assets_status").on(table.status),
  index("IDX_production_assets_safety_review").on(table.safetyReview),
  index("IDX_production_assets_approval_gate").on(table.approvalGate),
  index("IDX_production_assets_created_at").on(table.createdAt),
  check(
    "production_assets_public_url_must_be_null_in_r5c",
    sql`${table.publicUrl} IS NULL`,
  ),
]);

export type ProductionAsset = typeof productionAssets.$inferSelect;
export const insertProductionAssetSchema = createInsertSchema(productionAssets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publicUrl: true,
});
export type InsertProductionAsset = z.infer<typeof insertProductionAssetSchema>;

/* --------------------------------------------------------------------- */
/*  R5C/R5D — production_asset_audit_log                                 */
/*  Append-only audit trail for every lifecycle event on a               */
/*  production_assets row. Written atomically with the parent mutation   */
/*  inside a DB transaction by the storage layer (added in R5F).         */
/* --------------------------------------------------------------------- */
export const productionAssetAuditLog = pgTable("production_asset_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull().references(() => productionAssets.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull(),
  event: text("event").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_production_asset_audit_log_asset_created").on(table.assetId, table.createdAt),
  index("IDX_production_asset_audit_log_event").on(table.event),
]);

export type ProductionAssetAuditLog = typeof productionAssetAuditLog.$inferSelect;
export const insertProductionAssetAuditLogSchema = createInsertSchema(productionAssetAuditLog).omit({
  id: true,
  createdAt: true,
});
export type InsertProductionAssetAuditLog = z.infer<typeof insertProductionAssetAuditLogSchema>;

/* --------------------------------------------------------------------- */
/*  Task #783 — production_asset_deletion_snapshots                      */
/*  Sibling table written atomically inside                              */
/*  storage.deleteArchivedAsset BEFORE the ON DELETE CASCADE on          */
/*  production_asset_audit_log fires. Preserves the full per-asset       */
/*  audit-log payload (and the asset row itself) so the admin audit      */
/*  timeline survives the destructive delete. No FK to production_assets */
/*  — by design — because the asset row is gone after the transaction.   */
/* --------------------------------------------------------------------- */
export const productionAssetDeletionSnapshots = pgTable("production_asset_deletion_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull(),
  moderationLogId: varchar("moderation_log_id"),
  actorUserId: text("actor_user_id").notNull(),
  reason: text("reason"),
  assetSnapshot: jsonb("asset_snapshot").notNull(),
  auditLogSnapshot: jsonb("audit_log_snapshot").notNull(),
  auditRowCount: integer("audit_row_count").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_production_asset_deletion_snapshots_asset_created").on(table.assetId, table.createdAt),
  index("IDX_production_asset_deletion_snapshots_mod_log").on(table.moderationLogId),
]);

export type ProductionAssetDeletionSnapshot = typeof productionAssetDeletionSnapshots.$inferSelect;
export const insertProductionAssetDeletionSnapshotSchema = createInsertSchema(
  productionAssetDeletionSnapshots,
).omit({ id: true, createdAt: true });
export type InsertProductionAssetDeletionSnapshot = z.infer<
  typeof insertProductionAssetDeletionSnapshotSchema
>;

/* --------------------------------------------------------------------- */
/*  Task #754 — Real Avatar Rig Library: production_rigs table           */
/*  Mirrors the production_assets approval lifecycle, but for humanoid   */
/*  avatar rigs (GLB/GLTF). Same safety invariants:                      */
/*  status=draft, lifecycleState=uploaded, licenseStatus=unknown,        */
/*  safetyReview=pending, approvalGate=not_approved, publicUrl=null.     */
/*  CHECK constraint enforces publicUrl IS NULL.                         */
/* --------------------------------------------------------------------- */
export const productionRigs = pgTable("production_rigs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  format: text("format").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull().unique(),
  originalSourceUrl: text("original_source_url"),
  storageKey: text("storage_key").notNull(),
  uploaderUserId: text("uploader_user_id").notNull(),
  status: text("status").notNull().default("draft"),
  lifecycleState: text("lifecycle_state").notNull().default("uploaded"),
  licenseStatus: text("license_status").notNull().default("unknown"),
  licenseSource: text("license_source"),
  licenseNote: text("license_note"),
  safetyReview: text("safety_review").notNull().default("pending"),
  safetyNote: text("safety_note"),
  approvalGate: text("approval_gate").notNull().default("not_approved"),
  publicUrl: text("public_url").default(sql`NULL`),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_production_rigs_status").on(table.status),
  index("IDX_production_rigs_safety_review").on(table.safetyReview),
  index("IDX_production_rigs_approval_gate").on(table.approvalGate),
  index("IDX_production_rigs_created_at").on(table.createdAt),
  check(
    "production_rigs_public_url_must_be_null",
    sql`${table.publicUrl} IS NULL`,
  ),
]);

export type ProductionRig = typeof productionRigs.$inferSelect;
export const insertProductionRigSchema = createInsertSchema(productionRigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publicUrl: true,
});
export type InsertProductionRig = z.infer<typeof insertProductionRigSchema>;

export const productionRigAuditLog = pgTable("production_rig_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rigId: varchar("rig_id").notNull().references(() => productionRigs.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull(),
  event: text("event").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_production_rig_audit_log_rig_created").on(table.rigId, table.createdAt),
  index("IDX_production_rig_audit_log_event").on(table.event),
]);

export type ProductionRigAuditLog = typeof productionRigAuditLog.$inferSelect;
export const insertProductionRigAuditLogSchema = createInsertSchema(productionRigAuditLog).omit({
  id: true,
  createdAt: true,
});
export type InsertProductionRigAuditLog = z.infer<typeof insertProductionRigAuditLogSchema>;

/* --------------------------------------------------------------------- */
/*  R7B-Schema — permanent_avatars + permanent_avatar_audit_log +        */
/*  permanent_avatar_tombstones                                          */
/*                                                                       */
/*  Implements the schema layer of                                       */
/*  docs/design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md.                   */
/*                                                                       */
/*  A permanent_avatars row binds ONE approved production_assets body    */
/*  + ONE approved production_rigs rig + identity / persona / default-   */
/*  room metadata. Hard safety invariants are pinned at the database    */
/*  layer (CHECKs) so no future route mutation can flip them:            */
/*    - publicUrl IS NULL                                                */
/*    - realSendAllowed = FALSE                                          */
/*    - executionEnabled = FALSE                                         */
/*    - visibility = 'admin_only_internal'                               */
/*    - approvalGate IN ('not_approved','approved_internal')             */
/*      (no 'approved_public' state — ever)                              */
/*    - status / lifecycleState / identityReview / safetyReview /        */
/*      rolePreset / defaultRoomKind are enum-pinned                     */
/*                                                                       */
/*  FK strategy:                                                         */
/*    - bodyAssetId / rigId → production_assets / production_rigs        */
/*      ON DELETE RESTRICT  (asset/rig cannot be deleted while a         */
/*      permanent avatar references them — operator must archive +       */
/*      delete the permanent_avatar first)                               */
/*    - permanent_avatar_audit_log → permanent_avatars ON DELETE CASCADE */
/*                                                                       */
/*  Tombstones (permanent_avatar_tombstones) are immutable forensic      */
/*  rows written INSIDE the same transaction as the permanent delete,    */
/*  BEFORE the audit-log cascade. They preserve the slug burn (slug      */
/*  cannot be re-used after delete) and a full snapshot of the row.      */
/*  No FK to permanent_avatars — by design — because the parent row is   */
/*  gone after the transaction. Same discipline as                       */
/*  production_asset_deletion_snapshots (Task #783).                     */
/*                                                                       */
/*  This task ships SCHEMA ONLY: no routes, no UI, no provider calls,   */
/*  no R3F preview changes, no back-reference columns on                 */
/*  production_assets / production_rigs, no publicUrl / publishing /     */
/*  render / live / Unreal / 4D hardware behavior.                       */
/* --------------------------------------------------------------------- */
export const permanentAvatars = pgTable("permanent_avatars", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Identity / persona
  displayName: text("display_name").notNull(),
  slug: text("slug").notNull().unique(),
  personaSummary: text("persona_summary").notNull().default(""),
  rolePreset: text("role_preset").notNull().default("custom"),
  voiceProfileHint: text("voice_profile_hint").notNull().default(""),
  languageHint: text("language_hint").notNull().default(""),

  // Bound approved assets (RESTRICT — see header comment)
  bodyAssetId: varchar("body_asset_id")
    .notNull()
    .references(() => productionAssets.id, { onDelete: "restrict" }),
  rigId: varchar("rig_id")
    .notNull()
    .references(() => productionRigs.id, { onDelete: "restrict" }),

  // Default room assignment (soft FK — rooms table does not exist yet)
  defaultRoomKind: text("default_room_kind"),
  defaultRoomId: varchar("default_room_id"),

  // Approval lifecycle (mirrors productionRigs)
  status: text("status").notNull().default("draft"),
  lifecycleState: text("lifecycle_state").notNull().default("composed"),
  identityReview: text("identity_review").notNull().default("pending"),
  identityReviewNote: text("identity_review_note"),
  safetyReview: text("safety_review").notNull().default("pending"),
  safetyReviewNote: text("safety_review_note"),
  approvalGate: text("approval_gate").notNull().default("not_approved"),

  // Hard safety invariants (CHECK-pinned below)
  publicUrl: text("public_url").default(sql`NULL`),
  realSendAllowed: boolean("real_send_allowed").notNull().default(false),
  executionEnabled: boolean("execution_enabled").notNull().default(false),
  visibility: text("visibility").notNull().default("admin_only_internal"),

  createdByUserId: text("created_by_user_id").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_permanent_avatars_status").on(table.status),
  index("IDX_permanent_avatars_safety_review").on(table.safetyReview),
  index("IDX_permanent_avatars_identity_review").on(table.identityReview),
  index("IDX_permanent_avatars_approval_gate").on(table.approvalGate),
  index("IDX_permanent_avatars_body_asset").on(table.bodyAssetId),
  index("IDX_permanent_avatars_rig").on(table.rigId),
  uniqueIndex("UQ_permanent_avatars_body_rig_pair").on(
    table.bodyAssetId,
    table.rigId,
  ),
  // Hard safety invariants (defence-in-depth alongside the route serializer)
  check(
    "permanent_avatars_public_url_must_be_null",
    sql`${table.publicUrl} IS NULL`,
  ),
  check(
    "permanent_avatars_real_send_must_be_false",
    sql`${table.realSendAllowed} = FALSE`,
  ),
  check(
    "permanent_avatars_execution_must_be_false",
    sql`${table.executionEnabled} = FALSE`,
  ),
  check(
    "permanent_avatars_visibility_admin_only",
    sql`${table.visibility} = 'admin_only_internal'`,
  ),
  // Enum allow-lists (no approved_public; no unknown lifecycle value)
  check(
    "permanent_avatars_status_allow_list",
    sql`${table.status} IN ('draft','active','archived')`,
  ),
  check(
    "permanent_avatars_lifecycle_state_allow_list",
    sql`${table.lifecycleState} IN ('composed','identity_reviewed','safety_reviewed','approved_internal')`,
  ),
  check(
    "permanent_avatars_identity_review_allow_list",
    sql`${table.identityReview} IN ('pending','approved_internal','rejected','needs_changes')`,
  ),
  check(
    "permanent_avatars_safety_review_allow_list",
    sql`${table.safetyReview} IN ('pending','approved_internal','rejected','needs_changes')`,
  ),
  check(
    "permanent_avatars_approval_gate_no_public",
    sql`${table.approvalGate} IN ('not_approved','approved_internal')`,
  ),
  check(
    "permanent_avatars_role_preset_allow_list",
    sql`${table.rolePreset} IN ('news_anchor','podcast_host','debate_moderator','guest','analyst','field_reporter','teacher','virtual_ceo','ai_assistant','custom')`,
  ),
  check(
    "permanent_avatars_default_room_kind_allow_list",
    sql`${table.defaultRoomKind} IS NULL OR ${table.defaultRoomKind} IN ('news_room','podcast_room','debate_studio','living_room')`,
  ),
]);

export type PermanentAvatar = typeof permanentAvatars.$inferSelect;
export const insertPermanentAvatarSchema = createInsertSchema(permanentAvatars).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publicUrl: true,
  realSendAllowed: true,
  executionEnabled: true,
  visibility: true,
});
export type InsertPermanentAvatar = z.infer<typeof insertPermanentAvatarSchema>;

export const permanentAvatarAuditLog = pgTable("permanent_avatar_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  permanentAvatarId: varchar("permanent_avatar_id")
    .notNull()
    .references(() => permanentAvatars.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull(),
  event: text("event").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_permanent_avatar_audit_log_avatar_created").on(
    table.permanentAvatarId,
    table.createdAt,
  ),
  index("IDX_permanent_avatar_audit_log_event").on(table.event),
]);

export type PermanentAvatarAuditLog = typeof permanentAvatarAuditLog.$inferSelect;
export const insertPermanentAvatarAuditLogSchema = createInsertSchema(
  permanentAvatarAuditLog,
).omit({
  id: true,
  createdAt: true,
});
export type InsertPermanentAvatarAuditLog = z.infer<
  typeof insertPermanentAvatarAuditLogSchema
>;

/*
 * permanent_avatar_tombstones — immutable forensic row written inside the
 * same transaction as a permanent_avatars delete, BEFORE the audit-log
 * cascade fires. No FK to permanent_avatars — by design — because the
 * parent row is gone after the transaction. `slug` is duplicated here so
 * it stays burned (cannot be reused even after the parent row is gone);
 * the route layer (separate task) must check both tables when validating
 * a new slug.
 */
export const permanentAvatarTombstones = pgTable("permanent_avatar_tombstones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalPermanentAvatarId: varchar("original_permanent_avatar_id").notNull(),
  slug: text("slug").notNull(),
  displayName: text("display_name").notNull(),
  bodyAssetId: varchar("body_asset_id").notNull(),
  rigId: varchar("rig_id").notNull(),
  finalSnapshot: jsonb("final_snapshot").notNull(),
  auditLogCount: integer("audit_log_count").notNull(),
  deletedByUserId: text("deleted_by_user_id").notNull(),
  deletionReason: text("deletion_reason").notNull(),
  deletedAt: timestamp("deleted_at").notNull().defaultNow(),
}, (table) => [
  index("IDX_permanent_avatar_tombstones_slug").on(table.slug),
  index("IDX_permanent_avatar_tombstones_original_id").on(
    table.originalPermanentAvatarId,
  ),
  index("IDX_permanent_avatar_tombstones_deleted_at").on(table.deletedAt),
]);

export type PermanentAvatarTombstone = typeof permanentAvatarTombstones.$inferSelect;
export const insertPermanentAvatarTombstoneSchema = createInsertSchema(
  permanentAvatarTombstones,
).omit({
  id: true,
  deletedAt: true,
});
export type InsertPermanentAvatarTombstone = z.infer<
  typeof insertPermanentAvatarTombstoneSchema
>;

/* --------------------------------------------------------------------- */
/*  Task #806 — production_asset_orphan_sweep_flapping_snoozes           */
/*  Append-only audit trail of every snooze action taken on the         */
/*  3D-asset orphan-sweep flapping banner (Task #793). The live snooze  */
/*  state is stored in `system_settings` (key                            */
/*  `production_asset_orphan_sweep_flapping_snooze_until`) — this table */
/*  records WHO snoozed/unsnoozed WHEN, capped at the 24h policy        */
/*  enforced by the route. Mirrors                                       */
/*  `audience_audit_email_failure_alert_snoozes` (Task #613).            */
/* --------------------------------------------------------------------- */
export const productionAssetOrphanSweepFlappingSnoozes = pgTable(
  "production_asset_orphan_sweep_flapping_snoozes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    action: text("action").notNull(), // 'set' | 'cleared' | 'expired' | 'replaced'
    snoozeUntil: timestamp("snooze_until"),
    updatedBy: text("updated_by"),
    reason: text("reason"),
    // Task #815 — running count of flapping alerts swallowed by this
    // snooze window. On 'set' rows it is incremented in place as each
    // would-be alert is suppressed; on 'cleared' / 'expired' / 'replaced'
    // end-of-window rows it is the final tally copied from the active
    // 'set' row at the moment the window closed.
    suppressedCount: integer("suppressed_count").notNull().default(0),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("IDX_paossfs_occurred_at").on(t.occurredAt),
  ],
);
export type ProductionAssetOrphanSweepFlappingSnoozeRow =
  typeof productionAssetOrphanSweepFlappingSnoozes.$inferSelect;
export const insertProductionAssetOrphanSweepFlappingSnoozeSchema =
  createInsertSchema(productionAssetOrphanSweepFlappingSnoozes).omit({
    id: true,
    occurredAt: true,
  });
export type InsertProductionAssetOrphanSweepFlappingSnooze = z.infer<
  typeof insertProductionAssetOrphanSweepFlappingSnoozeSchema
>;

/* --------------------------------------------------------------------- */
/*  Task #825 — production_asset_orphan_sweep_flapping_config_history    */
/*  Append-only audit trail of every change to the flapping alert       */
/*  configuration (Task #794 — flappingThreshold + flappingWindowMs).    */
/*  The live config in `system_settings` only carries the CURRENT       */
/*  shape; once a founder tunes these knobs there is no record of who   */
/*  changed what when. This table closes that audit gap. Sanitized —    */
/*  no secrets are ever written; mirrors                                 */
/*  `audience_audit_export_notifier_config_history` (Task #728).         */
/* --------------------------------------------------------------------- */
export const productionAssetOrphanSweepFlappingConfigHistory = pgTable(
  "production_asset_orphan_sweep_flapping_config_history",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    updatedBy: text("updated_by"),
    action: text("action").notNull(), // 'updated' | 'restored_default'
    previousConfig: jsonb("previous_config"),
    newConfig: jsonb("new_config"),
    changedFields: text("changed_fields")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (t) => [
    index("IDX_paossfch_occurred_at").on(t.occurredAt),
  ],
);
export type ProductionAssetOrphanSweepFlappingConfigHistoryRow =
  typeof productionAssetOrphanSweepFlappingConfigHistory.$inferSelect;
