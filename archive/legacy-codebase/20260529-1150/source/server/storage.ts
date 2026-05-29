import {
  type User, type InsertUser,
  type Topic, type InsertTopic,
  type Post, type InsertPost,
  type Comment, type InsertComment,
  type Claim, type InsertClaim,
  type Evidence, type InsertEvidence,
  type TrustScore, type InsertTrustScore,
  type AgentVote, type InsertAgentVote,
  type ReputationHistory, type InsertReputationHistory,
  type ExpertiseTag, type InsertExpertiseTag,
  type Transaction, type InsertTransaction,
  type AgentLearningProfile, type InsertAgentLearningProfile,
  type AgentActivityLog, type InsertAgentActivityLog,
  type AgentSociety, type InsertAgentSociety,
  type SocietyMember, type InsertSocietyMember,
  type DelegatedTask, type InsertDelegatedTask,
  type AgentMessage, type InsertAgentMessage,
  type GovernanceProposal, type InsertGovernanceProposal,
  type GovernanceVote, type InsertGovernanceVote,
  type Alliance, type InsertAlliance,
  type AllianceMember, type InsertAllianceMember,
  type InstitutionRule, type InsertInstitutionRule,
  type TaskContract, type InsertTaskContract,
  type TaskBid, type InsertTaskBid,
  type Civilization, type InsertCivilization,
  type AgentIdentity, type InsertAgentIdentity,
  type AgentMemory, type InsertAgentMemory,
  type CivilizationInvestment, type InsertCivilizationInvestment,
  type AgentGenome, type InsertAgentGenome,
  type UserAgent, type InsertUserAgent,
  type AgentKnowledgeSource, type InsertAgentKnowledgeSource,
  type MarketplaceListing, type InsertMarketplaceListing,
  type AgentMarketplaceClonePackage, type InsertAgentMarketplaceClonePackage,
  type AgentPurchase, type InsertAgentPurchase,
  type AgentUsageLog, type InsertAgentUsageLog,
  type AgentLineage, type InsertAgentLineage,
  type CulturalMemory, type InsertCulturalMemory,
  type EthicalProfile, type InsertEthicalProfile,
  type EthicalRule, type InsertEthicalRule,
  type EthicalEvent, type InsertEthicalEvent,
  type GlobalMetrics, type InsertGlobalMetrics,
  type GlobalGoalField, type InsertGlobalGoalField,
  type GlobalInsight, type InsertGlobalInsight,
  type LiveDebate, type InsertLiveDebate,
  type DebateParticipant, type InsertDebateParticipant,
  type DebateTurn, type InsertDebateTurn,
  type FlywheelJob, type InsertFlywheelJob,
  type GeneratedClip, type InsertGeneratedClip,
  type NewsArticle, type InsertNewsArticle,
  type NewsSource, type InsertNewsSource,
  type NewsComment, type InsertNewsComment,
  type NewsReaction, type InsertNewsReaction,
  type NewsShare, type InsertNewsShare,
  type SocialAccount, type InsertSocialAccount,
  type SocialPost, type InsertSocialPost,
  type PromotionScore, type InsertPromotionScore,
  type SocialPerformance, type InsertSocialPerformance,
  type GrowthPattern, type InsertGrowthPattern,
  type SystemControlConfig, type InsertSystemControlConfig,
  type ActivityMetric, type InsertActivityMetric,
  type AnomalyEvent, type InsertAnomalyEvent,
  type AutomationDecision, type InsertAutomationDecision,
  type AutomationPolicy, type InsertAutomationPolicy,
  type SubscriptionPlan, type InsertSubscriptionPlan,
  type UserSubscription, type InsertUserSubscription,
  type CreditPackage, type InsertCreditPackage,
  type CreditPurchase, type InsertCreditPurchase,
  type Invoice, type InsertInvoice,
  type CreditUsageLog, type InsertCreditUsageLog,
  type ModerationLog, type InsertModerationLog,
  users, topics, posts, comments, postLikes,
  claims, evidence, trustScores, agentVotes, reputationHistory, expertiseTags,
  transactions, agentLearningProfiles, agentActivityLog,
  agentSocieties, societyMembers, delegatedTasks, agentMessages,
  governanceProposals, governanceVotes, alliances, allianceMembers,
  institutionRules, taskContracts, taskBids,
  civilizations, agentIdentities, agentMemory, civilizationInvestments,
  agentGenomes, agentLineage, culturalMemory,
  ethicalProfiles, ethicalRules, ethicalEvents,
  globalMetrics, globalGoalField, globalInsights,
  liveDebates, debateParticipants, debateTurns,
  flywheelJobs, generatedClips,
  newsArticles, newsSources, newsComments, newsReactions, newsShares,
  socialAccounts, socialPosts, promotionScores,
  socialPerformance, growthPatterns,
  systemControlConfig,
  activityMetrics, anomalyEvents, automationDecisions, automationPolicy,
  subscriptionPlans, userSubscriptions, creditPackages, creditPurchases, invoices, creditUsageLog,
  moderationLogs,
  userAgents, agentKnowledgeSources, marketplaceListings, agentMarketplaceClonePackages, agentPurchases, agentUsageLogs,
  agentReviews, agentVersions, agentCostLogs,
  agentTeams, teamMembers, teamTasks, teamMessages, teamWorkspaces,
  type AgentReview, type InsertAgentReview,
  type AgentVersion, type InsertAgentVersion,
  type AgentCostLog, type InsertAgentCostLog,
  type AgentTeam, type InsertAgentTeam,
  type TeamMember, type InsertTeamMember,
  type TeamTask, type InsertTeamTask,
  type TeamMessage, type InsertTeamMessage,
  type TeamWorkspace, type InsertTeamWorkspace,
  type AgentComputeBudget, type InsertAgentComputeBudget,
  type AgentVisibilityScore, type InsertAgentVisibilityScore,
  type PolicyRule, type InsertPolicyRule,
  type PolicyViolation, type InsertPolicyViolation,
  type CreditSink, type InsertCreditSink,
  type CivilizationHealthSnapshot, type InsertCivilizationHealthSnapshot,
  agentComputeBudgets, agentVisibilityScores, policyRules, policyViolations, creditSinks, civilizationHealthSnapshots,
  type PlatformEvent, type InsertPlatformEvent,
  type AgentPassport, type InsertAgentPassport,
  type AgentPassportExport, type InsertAgentPassportExport,
  type FlywheelAgent, type InsertFlywheelAgent,
  type FlywheelRecommendation, type InsertFlywheelRecommendation,
  type FlywheelAutomationConfig, type InsertFlywheelAutomationConfig,
  type FlywheelOptimizationOutcome, type InsertFlywheelOptimizationOutcome,
  platformEvents, agentPassports, agentPassportExports, flywheelAgents, flywheelRecommendations, flywheelAutomationConfig, flywheelOptimizationOutcomes,
  type FlywheelMetric, type InsertFlywheelMetric,
  flywheelMetrics,
  type PersonalAgentProfile, type InsertPersonalAgentProfile,
  type PersonalAgentMemory, type InsertPersonalAgentMemory,
  type PersonalAgentConversation, type InsertPersonalAgentConversation,
  type PersonalAgentMessage, type InsertPersonalAgentMessage,
  type PersonalAgentTask, type InsertPersonalAgentTask,
  type PersonalAgentDevice, type InsertPersonalAgentDevice,
  type PersonalAgentFinanceEntry, type InsertPersonalAgentFinanceEntry,
  type PersonalAgentUsage, type InsertPersonalAgentUsage,
  personalAgentProfiles, personalAgentMemories, personalAgentConversations,
  personalAgentMessages, personalAgentTasks, personalAgentDevices,
  personalAgentFinance, personalAgentUsage,
  type AgentPrivacyVault, type InsertAgentPrivacyVault,
  type PrivacyAccessLog, type InsertPrivacyAccessLog,
  type PrivacyViolation, type InsertPrivacyViolation,
  type PrivacyGatewayRule, type InsertPrivacyGatewayRule,
  agentPrivacyVaults, privacyAccessLogs, privacyViolations, privacyGatewayRules,
  type UserTrustVault, type InsertUserTrustVault,
  type TrustPermissionToken, type InsertTrustPermissionToken,
  type TrustAccessEvent, type InsertTrustAccessEvent,
  type TrustHealthMetric, type InsertTrustHealthMetric,
  userTrustVaults, trustPermissionTokens, trustAccessEvents, trustHealthMetrics,
  type Project, type InsertProject,
  type ProjectPackage, type InsertProjectPackage,
  type ProjectAgentContribution, type InsertProjectAgentContribution,
  type ProjectPackagePurchase, type InsertProjectPackagePurchase,
  type ProjectValidation, type InsertProjectValidation,
  type ProjectFeedback, type InsertProjectFeedback,
  projects, projectPackages, projectAgentContributions, projectPackagePurchases, projectValidations, projectFeedback,
  type AdminFilterView, type InsertAdminFilterView,
  adminFilterViews,
  type ProductionAsset, type InsertProductionAsset,
  type ProductionAssetAuditLog, type InsertProductionAssetAuditLog,
  type ProductionAssetDeletionSnapshot,
  productionAssets, productionAssetAuditLog, productionAssetDeletionSnapshots,
  insertProductionAssetSchema, insertProductionAssetAuditLogSchema,
  type ProductionRig, type InsertProductionRig,
  type ProductionRigAuditLog, type InsertProductionRigAuditLog,
  productionRigs, productionRigAuditLog,
  insertProductionRigSchema, insertProductionRigAuditLogSchema,
  type PermanentAvatar, type InsertPermanentAvatar,
  type PermanentAvatarAuditLog, type InsertPermanentAvatarAuditLog,
  type PermanentAvatarTombstone,
  permanentAvatars, permanentAvatarAuditLog, permanentAvatarTombstones,
  insertPermanentAvatarSchema, insertPermanentAvatarAuditLogSchema,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, and, asc, gte, lte, inArray } from "drizzle-orm";

export interface IStorage {
  // Flywheel Metrics
  getFlywheelMetrics(): Promise<FlywheelMetric[]>;
  addFlywheelMetric(metric: InsertFlywheelMetric): Promise<FlywheelMetric>;

  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByApiToken(token: string): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  getUsers(): Promise<User[]>;
  getUsersRanked(): Promise<User[]>;
  markUserAsSpammer(userId: string): Promise<void>;
  shadowBanUser(userId: string): Promise<void>;
  unbanUser(userId: string): Promise<void>;
  getFlaggedUsers(): Promise<User[]>;
  createModerationLog(log: InsertModerationLog): Promise<ModerationLog>;
  getModerationLogs(limit: number): Promise<ModerationLog[]>;
  getModerationLogsByUser(userId: string): Promise<ModerationLog[]>;

  getTopics(): Promise<Topic[]>;
  getTopicBySlug(slug: string): Promise<Topic | undefined>;
  createTopic(topic: InsertTopic): Promise<Topic>;

  getPosts(): Promise<Post[]>;
  getPostsByTopic(topicSlug: string): Promise<Post[]>;
  getPostsPaginated(options: { topic?: string; sort?: string; page?: number; limit?: number }): Promise<{ posts: Post[]; total: number }>;
  getPost(id: string): Promise<Post | undefined>;
  createPost(post: InsertPost): Promise<Post>;
  likePost(postId: string, userId: string): Promise<Post>;
  unlikePost(postId: string, userId: string): Promise<Post>;
  hasLiked(postId: string, userId: string): Promise<boolean>;

  getComments(postId: string): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  getCommentCount(postId: string): Promise<number>;

  getClaims(postId: string): Promise<Claim[]>;
  createClaim(claim: InsertClaim): Promise<Claim>;

  getEvidence(postId: string): Promise<Evidence[]>;
  createEvidence(ev: InsertEvidence): Promise<Evidence>;

  getTrustScore(postId: string): Promise<TrustScore | undefined>;
  upsertTrustScore(ts: InsertTrustScore): Promise<TrustScore>;

  getAgentVotes(postId: string): Promise<AgentVote[]>;
  createAgentVote(vote: InsertAgentVote): Promise<AgentVote>;
  getAgentVoteCount(postId: string): Promise<number>;

  addReputationHistory(entry: InsertReputationHistory): Promise<ReputationHistory>;
  getReputationHistory(userId: string): Promise<ReputationHistory[]>;

  getExpertiseTags(userId: string): Promise<ExpertiseTag[]>;
  upsertExpertiseTag(tag: InsertExpertiseTag): Promise<ExpertiseTag>;

  createTransaction(tx: InsertTransaction): Promise<Transaction>;
  getTransactions(userId: string, limit: number): Promise<Transaction[]>;
  getTransactionsSince(userId: string, since: Date): Promise<Transaction[]>;
  getEconomyMetrics(): Promise<{ totalCreditsCirculating: number; totalTransactions: number; topEarners: { userId: string; total: number }[] }>;

  getLearningProfile(agentId: string): Promise<AgentLearningProfile | undefined>;
  upsertLearningProfile(agentId: string, data: Partial<AgentLearningProfile>): Promise<AgentLearningProfile>;
  getAllLearningProfiles(): Promise<AgentLearningProfile[]>;

  getAgentUsers(): Promise<User[]>;
  getRecentPosts(limit: number): Promise<Post[]>;
  createAgentActivity(entry: InsertAgentActivityLog): Promise<AgentActivityLog>;
  getAgentActivityLog(limit: number): Promise<AgentActivityLog[]>;
  getAgentLastActivity(agentId: string): Promise<AgentActivityLog | undefined>;
  getUsersByIds(ids: string[]): Promise<Map<string, User>>;
  getCommentCountsByPostIds(ids: string[]): Promise<Map<string, number>>;
  getTrustScoresByPostIds(ids: string[]): Promise<Map<string, TrustScore>>;
  getAgentVoteCountsByPostIds(ids: string[]): Promise<Map<string, number>>;
  getClaimsByPostIds(ids: string[]): Promise<Map<string, Claim[]>>;
  hasAgentActedOnPost(agentId: string, postId: string, actionType: string): Promise<boolean>;
  getAgentActionCountSince(agentId: string, since: Date): Promise<number>;

  getSocieties(): Promise<AgentSociety[]>;
  getSociety(id: string): Promise<AgentSociety | undefined>;
  createSociety(society: InsertAgentSociety): Promise<AgentSociety>;
  updateSociety(id: string, data: Partial<AgentSociety>): Promise<AgentSociety>;

  getSocietyMembers(societyId: string): Promise<SocietyMember[]>;
  getAgentSocieties(agentId: string): Promise<SocietyMember[]>;
  addSocietyMember(member: InsertSocietyMember): Promise<SocietyMember>;
  updateSocietyMember(id: string, data: Partial<SocietyMember>): Promise<SocietyMember>;

  getDelegatedTasks(societyId: string): Promise<DelegatedTask[]>;
  getDelegatedTasksByPost(postId: string): Promise<DelegatedTask[]>;
  getDelegatedTask(id: string): Promise<DelegatedTask | undefined>;
  createDelegatedTask(task: InsertDelegatedTask): Promise<DelegatedTask>;
  updateDelegatedTask(id: string, data: Partial<DelegatedTask>): Promise<DelegatedTask>;
  getPendingTasksForAgent(agentId: string): Promise<DelegatedTask[]>;

  createAgentMessage(msg: InsertAgentMessage): Promise<AgentMessage>;
  getMessagesByTask(taskId: string): Promise<AgentMessage[]>;
  getMessagesBySociety(societyId: string, limit: number): Promise<AgentMessage[]>;

  createProposal(proposal: InsertGovernanceProposal): Promise<GovernanceProposal>;
  getProposal(id: string): Promise<GovernanceProposal | undefined>;
  getProposals(status?: string): Promise<GovernanceProposal[]>;
  updateProposal(id: string, data: Partial<GovernanceProposal>): Promise<GovernanceProposal>;

  createVote(vote: InsertGovernanceVote): Promise<GovernanceVote>;
  getVotesByProposal(proposalId: string): Promise<GovernanceVote[]>;
  hasVoted(proposalId: string, voterId: string): Promise<boolean>;

  createAlliance(alliance: InsertAlliance): Promise<Alliance>;
  getAlliance(id: string): Promise<Alliance | undefined>;
  getAlliances(): Promise<Alliance[]>;
  updateAlliance(id: string, data: Partial<Alliance>): Promise<Alliance>;
  addAllianceMember(member: InsertAllianceMember): Promise<AllianceMember>;
  getAllianceMembers(allianceId: string): Promise<AllianceMember[]>;

  getInstitutionRules(): Promise<InstitutionRule[]>;
  getInstitutionRule(name: string): Promise<InstitutionRule | undefined>;
  upsertInstitutionRule(rule: InsertInstitutionRule): Promise<InstitutionRule>;

  createTaskContract(contract: InsertTaskContract): Promise<TaskContract>;
  getTaskContract(id: string): Promise<TaskContract | undefined>;
  getTaskContracts(status?: string): Promise<TaskContract[]>;
  updateTaskContract(id: string, data: Partial<TaskContract>): Promise<TaskContract>;

  createTaskBid(bid: InsertTaskBid): Promise<TaskBid>;
  getTaskBids(contractId: string): Promise<TaskBid[]>;
  updateTaskBid(id: string, data: Partial<TaskBid>): Promise<TaskBid>;

  deleteSocietyMember(id: string): Promise<void>;
  deleteSociety(id: string): Promise<void>;

  getCivilizations(): Promise<Civilization[]>;
  getCivilization(id: string): Promise<Civilization | undefined>;
  createCivilization(civ: InsertCivilization): Promise<Civilization>;
  updateCivilization(id: string, data: Partial<Civilization>): Promise<Civilization>;

  getAgentIdentity(agentId: string): Promise<AgentIdentity | undefined>;
  upsertAgentIdentity(agentId: string, data: Partial<AgentIdentity>): Promise<AgentIdentity>;
  getAgentIdentities(): Promise<AgentIdentity[]>;
  getIdentitiesByCivilization(civilizationId: string): Promise<AgentIdentity[]>;

  addAgentMemory(entry: InsertAgentMemory): Promise<AgentMemory>;
  getAgentMemories(agentId: string, limit: number): Promise<AgentMemory[]>;
  getAgentMemoriesByType(agentId: string, eventType: string, limit: number): Promise<AgentMemory[]>;

  createInvestment(inv: InsertCivilizationInvestment): Promise<CivilizationInvestment>;
  getInvestments(civilizationId: string): Promise<CivilizationInvestment[]>;
  getActiveInvestments(): Promise<CivilizationInvestment[]>;
  updateInvestment(id: string, data: Partial<CivilizationInvestment>): Promise<CivilizationInvestment>;

  getAgentGenome(agentId: string): Promise<AgentGenome | undefined>;
  upsertAgentGenome(agentId: string, data: Partial<AgentGenome>): Promise<AgentGenome>;
  getAllGenomes(): Promise<AgentGenome[]>;

  getAgentLineage(agentId: string): Promise<AgentLineage | undefined>;
  createAgentLineage(entry: InsertAgentLineage): Promise<AgentLineage>;
  updateAgentLineage(agentId: string, data: Partial<AgentLineage>): Promise<AgentLineage>;
  getLineageByParent(parentId: string): Promise<AgentLineage[]>;
  getAllLineages(): Promise<AgentLineage[]>;

  createCulturalMemoryEntry(entry: InsertCulturalMemory): Promise<CulturalMemory>;
  getCulturalMemories(limit: number): Promise<CulturalMemory[]>;
  getTopCulturalMemories(domain: string, limit: number): Promise<CulturalMemory[]>;
  updateCulturalMemory(id: string, data: Partial<CulturalMemory>): Promise<CulturalMemory>;

  getEthicalProfile(entityId: string): Promise<EthicalProfile | undefined>;
  upsertEthicalProfile(entityId: string, data: Partial<EthicalProfile>): Promise<EthicalProfile>;
  getAllEthicalProfiles(): Promise<EthicalProfile[]>;

  createEthicalRule(rule: InsertEthicalRule): Promise<EthicalRule>;
  getEthicalRule(id: string): Promise<EthicalRule | undefined>;
  getEthicalRules(status?: string): Promise<EthicalRule[]>;
  updateEthicalRule(id: string, data: Partial<EthicalRule>): Promise<EthicalRule>;

  createEthicalEvent(event: InsertEthicalEvent): Promise<EthicalEvent>;
  getEthicalEvents(limit: number): Promise<EthicalEvent[]>;
  getEthicalEventsByActor(actorId: string, limit: number): Promise<EthicalEvent[]>;

  createGlobalMetrics(metrics: InsertGlobalMetrics): Promise<GlobalMetrics>;
  getLatestGlobalMetrics(): Promise<GlobalMetrics | undefined>;
  getGlobalMetricsHistory(limit: number): Promise<GlobalMetrics[]>;

  upsertGlobalGoalField(data: Partial<GlobalGoalField>): Promise<GlobalGoalField>;
  getLatestGoalField(): Promise<GlobalGoalField | undefined>;

  createGlobalInsight(insight: InsertGlobalInsight): Promise<GlobalInsight>;
  getGlobalInsight(id: string): Promise<GlobalInsight | undefined>;
  getGlobalInsights(status?: string): Promise<GlobalInsight[]>;
  updateGlobalInsight(id: string, data: Partial<GlobalInsight>): Promise<GlobalInsight>;

  createLiveDebate(debate: InsertLiveDebate): Promise<LiveDebate>;
  getLiveDebate(id: number): Promise<LiveDebate | undefined>;
  getLiveDebates(status?: string): Promise<LiveDebate[]>;
  updateLiveDebate(id: number, data: Partial<LiveDebate>): Promise<LiveDebate>;

  addDebateParticipant(participant: InsertDebateParticipant): Promise<DebateParticipant>;
  getDebateParticipants(debateId: number): Promise<DebateParticipant[]>;
  getDebateParticipant(id: number): Promise<DebateParticipant | undefined>;
  updateDebateParticipant(id: number, data: Partial<DebateParticipant>): Promise<DebateParticipant>;
  removeDebateParticipant(id: number): Promise<void>;

  createDebateTurn(turn: InsertDebateTurn): Promise<DebateTurn>;
  getDebateTurns(debateId: number): Promise<DebateTurn[]>;
  getDebateTurn(id: number): Promise<DebateTurn | undefined>;
  updateDebateTurn(id: number, data: Partial<DebateTurn>): Promise<DebateTurn>;

  createFlywheelJob(job: InsertFlywheelJob): Promise<FlywheelJob>;
  getFlywheelJob(id: number): Promise<FlywheelJob | undefined>;
  getFlywheelJobs(): Promise<FlywheelJob[]>;
  getFlywheelJobByDebate(debateId: number): Promise<FlywheelJob | undefined>;
  updateFlywheelJob(id: number, data: Partial<FlywheelJob>): Promise<FlywheelJob>;

  createGeneratedClip(clip: InsertGeneratedClip): Promise<GeneratedClip>;
  getGeneratedClip(id: number): Promise<GeneratedClip | undefined>;
  getClipsByJob(jobId: number): Promise<GeneratedClip[]>;
  getClipsByDebate(debateId: number): Promise<GeneratedClip[]>;
  updateGeneratedClip(id: number, data: Partial<GeneratedClip>): Promise<GeneratedClip>;

  createNewsArticle(article: InsertNewsArticle): Promise<NewsArticle>;
  getNewsArticle(id: number): Promise<NewsArticle | undefined>;
  getNewsArticleBySlug(slug: string): Promise<NewsArticle | undefined>;
  getNewsArticles(limit: number, category?: string, offset?: number): Promise<NewsArticle[]>;
  getNewsArticleByUrl(sourceUrl: string): Promise<NewsArticle | undefined>;
  getNewsArticleByTitleHash(titleHash: string): Promise<NewsArticle | undefined>;
  getLatestNews(limit: number): Promise<NewsArticle[]>;
  countNewsArticles(category?: string): Promise<number>;
  updateNewsArticle(id: number, data: Partial<NewsArticle>): Promise<NewsArticle>;
  getUnprocessedNews(limit: number): Promise<NewsArticle[]>;
  getBreakingNews(): Promise<NewsArticle[]>;

  listNewsSources(opts?: { enabledOnly?: boolean; activeOnly?: boolean }): Promise<NewsSource[]>;
  getNewsSource(id: string): Promise<NewsSource | undefined>;
  getNewsSourceByUrl(url: string): Promise<NewsSource | undefined>;
  createNewsSource(source: InsertNewsSource): Promise<NewsSource>;
  updateNewsSource(id: string, data: Partial<InsertNewsSource>): Promise<NewsSource>;
  disableNewsSource(id: string): Promise<NewsSource>;
  recordNewsSourceHealthCheck(
    id: string,
    data: {
      status: "ok" | "warning" | "error";
      httpStatus: number | null;
      itemCount: number | null;
      errorMessage: string | null;
      incrementFailure: boolean;
      resetFailure: boolean;
    },
  ): Promise<NewsSource | undefined>;

  createNewsComment(comment: InsertNewsComment): Promise<NewsComment>;
  getNewsComments(articleId: number): Promise<NewsComment[]>;
  getNewsCommentReplies(parentId: number): Promise<NewsComment[]>;
  likeNewsComment(commentId: number): Promise<void>;

  toggleNewsReaction(articleId: number, userId: string, reactionType: string): Promise<boolean>;
  getNewsReaction(articleId: number, userId: string): Promise<NewsReaction | undefined>;
  getNewsReactionCount(articleId: number): Promise<number>;

  createNewsShare(share: InsertNewsShare): Promise<NewsShare>;
  getNewsShareCount(articleId: number): Promise<number>;

  createSocialAccount(account: InsertSocialAccount): Promise<SocialAccount>;
  getSocialAccounts(): Promise<SocialAccount[]>;
  getSocialAccount(id: number): Promise<SocialAccount | undefined>;
  updateSocialAccount(id: number, data: Partial<SocialAccount>): Promise<SocialAccount>;
  deleteSocialAccount(id: number): Promise<void>;
  getActiveSocialAccounts(platform?: string): Promise<SocialAccount[]>;

  createSocialPost(post: InsertSocialPost): Promise<SocialPost>;
  getSocialPosts(limit?: number, status?: string): Promise<SocialPost[]>;
  getSocialPost(id: number): Promise<SocialPost | undefined>;
  updateSocialPost(id: number, data: Partial<SocialPost>): Promise<SocialPost>;
  getPendingSocialPosts(): Promise<SocialPost[]>;
  getSocialPostsByContent(contentType: string, contentId: string): Promise<SocialPost[]>;

  createPromotionScore(score: InsertPromotionScore): Promise<PromotionScore>;
  getPromotionScores(limit?: number, status?: string): Promise<PromotionScore[]>;
  getPromotionScore(id: number): Promise<PromotionScore | undefined>;
  getPromotionScoreByContent(contentType: string, contentId: string): Promise<PromotionScore | undefined>;
  updatePromotionScore(id: number, data: Partial<PromotionScore>): Promise<PromotionScore>;
  getPendingReviewPromotions(): Promise<PromotionScore[]>;

  createSocialPerformance(perf: InsertSocialPerformance): Promise<SocialPerformance>;
  getSocialPerformance(limit?: number): Promise<SocialPerformance[]>;
  getSocialPerformanceByPlatform(platform: string, limit?: number): Promise<SocialPerformance[]>;
  getSocialPerformanceSince(since: Date): Promise<SocialPerformance[]>;
  getTopViralPosts(limit?: number): Promise<SocialPerformance[]>;

  createGrowthPattern(pattern: InsertGrowthPattern): Promise<GrowthPattern>;
  getGrowthPatterns(platform?: string): Promise<GrowthPattern[]>;
  getActiveGrowthPatterns(platform?: string): Promise<GrowthPattern[]>;
  getGrowthPattern(id: number): Promise<GrowthPattern | undefined>;
  updateGrowthPattern(id: number, data: Partial<GrowthPattern>): Promise<GrowthPattern>;

  getSystemControlConfigs(): Promise<SystemControlConfig[]>;
  getSystemControlConfig(key: string): Promise<SystemControlConfig | undefined>;
  upsertSystemControlConfig(data: InsertSystemControlConfig): Promise<SystemControlConfig>;
  updateSystemControlValue(key: string, value: number): Promise<SystemControlConfig>;

  recordActivityMetric(metric: InsertActivityMetric): Promise<ActivityMetric>;
  getActivityMetrics(metricKey: string, since?: Date): Promise<ActivityMetric[]>;
  getLatestMetrics(): Promise<ActivityMetric[]>;

  createAnomalyEvent(event: InsertAnomalyEvent): Promise<AnomalyEvent>;
  getOpenAnomalies(): Promise<AnomalyEvent[]>;
  getAllAnomalies(limit?: number): Promise<AnomalyEvent[]>;
  updateAnomalyStatus(id: number, status: string, resolvedAt?: Date): Promise<AnomalyEvent>;

  createAutomationDecision(decision: InsertAutomationDecision): Promise<AutomationDecision>;
  getPendingDecisions(): Promise<AutomationDecision[]>;
  getAllDecisions(limit?: number): Promise<AutomationDecision[]>;
  resolveDecision(id: number, status: string, resolvedBy: string): Promise<AutomationDecision>;

  getAutomationPolicy(): Promise<AutomationPolicy | undefined>;
  upsertAutomationPolicy(data: Partial<InsertAutomationPolicy>): Promise<AutomationPolicy>;

  getSubscriptionPlans(): Promise<SubscriptionPlan[]>;
  getSubscriptionPlan(id: string): Promise<SubscriptionPlan | undefined>;
  getSubscriptionPlanByName(name: string): Promise<SubscriptionPlan | undefined>;
  createSubscriptionPlan(plan: InsertSubscriptionPlan): Promise<SubscriptionPlan>;

  getUserSubscription(userId: string): Promise<UserSubscription | undefined>;
  createUserSubscription(sub: InsertUserSubscription): Promise<UserSubscription>;
  updateUserSubscription(id: string, data: Partial<UserSubscription>): Promise<UserSubscription>;

  getCreditPackages(): Promise<CreditPackage[]>;
  createCreditPackage(pkg: InsertCreditPackage): Promise<CreditPackage>;

  createCreditPurchase(purchase: InsertCreditPurchase): Promise<CreditPurchase>;
  getCreditPurchases(userId: string): Promise<CreditPurchase[]>;

  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  getInvoices(userId: string): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  getAllInvoices(): Promise<Invoice[]>;

  createCreditUsage(entry: InsertCreditUsageLog): Promise<CreditUsageLog>;
  getCreditUsage(userId: string, limit?: number): Promise<CreditUsageLog[]>;
  getCreditUsageSince(userId: string, since: Date): Promise<CreditUsageLog[]>;
  getAllCreditUsage(limit?: number): Promise<CreditUsageLog[]>;

  createUserAgent(agent: InsertUserAgent): Promise<UserAgent>;
  getUserAgent(id: string): Promise<UserAgent | undefined>;
  getUserAgentsByOwner(ownerId: string): Promise<UserAgent[]>;
  updateUserAgent(id: string, data: Partial<UserAgent>): Promise<UserAgent>;
  deleteUserAgent(id: string): Promise<void>;
  getPublicAgents(): Promise<UserAgent[]>;
  getMarketplaceAgents(): Promise<UserAgent[]>;

  createAgentKnowledgeSource(source: InsertAgentKnowledgeSource): Promise<AgentKnowledgeSource>;
  getAgentKnowledgeSources(agentId: string): Promise<AgentKnowledgeSource[]>;
  getAgentKnowledgeSource(id: string): Promise<AgentKnowledgeSource | undefined>;
  deleteAgentKnowledgeSource(id: string): Promise<void>;

  createMarketplaceListing(listing: InsertMarketplaceListing): Promise<MarketplaceListing>;
  getMarketplaceListing(id: string): Promise<MarketplaceListing | undefined>;
  getMarketplaceListings(category?: string): Promise<MarketplaceListing[]>;
  getMarketplaceListingByAgent(agentId: string): Promise<MarketplaceListing | undefined>;
  updateMarketplaceListing(id: string, data: Partial<MarketplaceListing>): Promise<MarketplaceListing>;
  createAgentMarketplaceClonePackage(data: InsertAgentMarketplaceClonePackage): Promise<AgentMarketplaceClonePackage>;
  getAgentMarketplaceClonePackage(id: string): Promise<AgentMarketplaceClonePackage | undefined>;
  getAgentMarketplaceClonePackageByListingId(listingId: string): Promise<AgentMarketplaceClonePackage | undefined>;
  getAgentMarketplaceClonePackagesByCreator(creatorUserId: string): Promise<AgentMarketplaceClonePackage[]>;
  getAgentMarketplaceClonePackagesForReview(status?: string): Promise<AgentMarketplaceClonePackage[]>;
  updateAgentMarketplaceClonePackage(id: string, data: Partial<AgentMarketplaceClonePackage>): Promise<AgentMarketplaceClonePackage>;

  createAgentPurchase(purchase: InsertAgentPurchase): Promise<AgentPurchase>;
  getAgentPurchasesByBuyer(buyerId: string): Promise<AgentPurchase[]>;
  getAgentPurchasesBySeller(sellerId: string): Promise<AgentPurchase[]>;
  hasUserPurchasedAgent(buyerId: string, agentId: string): Promise<boolean>;

  createAgentUsageLog(log: InsertAgentUsageLog): Promise<AgentUsageLog>;
  getAgentUsageLogs(agentId: string, limit?: number): Promise<AgentUsageLog[]>;

  createAgentReview(review: InsertAgentReview): Promise<AgentReview>;
  getAgentReviews(agentId: string): Promise<AgentReview[]>;
  getReviewsByListing(listingId: string): Promise<AgentReview[]>;

  createAgentVersion(version: InsertAgentVersion): Promise<AgentVersion>;
  getAgentVersions(agentId: string): Promise<AgentVersion[]>;

  createAgentCostLog(log: InsertAgentCostLog): Promise<AgentCostLog>;
  getAgentCostLogs(ownerId: string, limit?: number): Promise<AgentCostLog[]>;
  getAgentCostLogsByAgent(agentId: string, limit?: number): Promise<AgentCostLog[]>;

  getStoreRankings(limit?: number): Promise<MarketplaceListing[]>;
  getFeaturedListings(): Promise<MarketplaceListing[]>;
  getTrendingListings(limit?: number): Promise<MarketplaceListing[]>;
  searchListings(query: string, category?: string): Promise<MarketplaceListing[]>;

  // Agent Teams
  createTeam(data: InsertAgentTeam): Promise<AgentTeam>;
  getTeam(id: string): Promise<AgentTeam | undefined>;
  getTeams(): Promise<AgentTeam[]>;
  updateTeam(id: string, data: Partial<AgentTeam>): Promise<AgentTeam>;
  createTeamMember(data: InsertTeamMember): Promise<TeamMember>;
  getTeamMembers(teamId: string): Promise<TeamMember[]>;
  updateTeamMember(id: string, data: Partial<TeamMember>): Promise<TeamMember>;
  createTeamTask(data: InsertTeamTask): Promise<TeamTask>;
  getTeamTasks(teamId: string): Promise<TeamTask[]>;
  getTeamTask(id: string): Promise<TeamTask | undefined>;
  updateTeamTask(id: string, data: Partial<TeamTask>): Promise<TeamTask>;
  createTeamMessage(data: InsertTeamMessage): Promise<TeamMessage>;
  getTeamMessages(teamId: string): Promise<TeamMessage[]>;
  setWorkspaceEntry(data: InsertTeamWorkspace): Promise<TeamWorkspace>;
  getWorkspaceEntries(teamId: string): Promise<TeamWorkspace[]>;

  // Civilization Stability Layer
  getComputeBudget(agentId: string): Promise<AgentComputeBudget | undefined>;
  upsertComputeBudget(data: InsertAgentComputeBudget): Promise<AgentComputeBudget>;
  getAllComputeBudgets(): Promise<AgentComputeBudget[]>;
  updateComputeBudget(id: string, data: Partial<AgentComputeBudget>): Promise<AgentComputeBudget>;
  resetAllDailyBudgets(): Promise<void>;
  getVisibilityScore(agentId: string): Promise<AgentVisibilityScore | undefined>;
  upsertVisibilityScore(data: InsertAgentVisibilityScore): Promise<AgentVisibilityScore>;
  getAllVisibilityScores(): Promise<AgentVisibilityScore[]>;
  getPolicyRules(): Promise<PolicyRule[]>;
  createPolicyRule(data: InsertPolicyRule): Promise<PolicyRule>;
  updatePolicyRule(id: string, data: Partial<PolicyRule>): Promise<PolicyRule>;
  getPolicyViolations(limit?: number): Promise<PolicyViolation[]>;
  createPolicyViolation(data: InsertPolicyViolation): Promise<PolicyViolation>;
  updatePolicyViolation(id: string, data: Partial<PolicyViolation>): Promise<PolicyViolation>;
  getViolationsByAgent(agentId: string): Promise<PolicyViolation[]>;
  createCreditSink(data: InsertCreditSink): Promise<CreditSink>;
  getCreditSinks(limit?: number): Promise<CreditSink[]>;
  getCreditSinkTotals(): Promise<{ type: string; total: number }[]>;
  createHealthSnapshot(data: InsertCivilizationHealthSnapshot): Promise<CivilizationHealthSnapshot>;
  getHealthSnapshots(limit?: number): Promise<CivilizationHealthSnapshot[]>;
  getLatestHealthSnapshot(): Promise<CivilizationHealthSnapshot | undefined>;

  createPlatformEvent(data: InsertPlatformEvent): Promise<PlatformEvent>;
  getPlatformEvents(limit?: number): Promise<PlatformEvent[]>;
  getPlatformEventsByType(eventType: string, limit?: number): Promise<PlatformEvent[]>;
  getPlatformEventsSince(since: Date): Promise<PlatformEvent[]>;
  getPlatformEventCounts(): Promise<{ eventType: string; count: number }[]>;
  createAgentPassport(data: InsertAgentPassport): Promise<AgentPassport>;
  getAgentPassportsByOwner(ownerId: string): Promise<AgentPassport[]>;
  revokeAgentPassport(id: string, ownerId: string): Promise<AgentPassport | undefined>;
  getAgentPassportByHash(hash: string): Promise<AgentPassport | undefined>;
  createAgentPassportExport(data: InsertAgentPassportExport): Promise<AgentPassportExport>;
  getAgentPassportExportsByOwner(ownerId: string): Promise<AgentPassportExport[]>;
  revokeAgentPassportExport(id: string, ownerId: string, reason?: string | null): Promise<AgentPassportExport | undefined>;
  getAgentPassportExportByHash(hash: string): Promise<AgentPassportExport | undefined>;
  getAgentPassportExportById(id: string): Promise<AgentPassportExport | undefined>;

  createFlywheelAgent(data: InsertFlywheelAgent): Promise<FlywheelAgent>;
  getFlywheelAgents(): Promise<FlywheelAgent[]>;
  getFlywheelAgentByType(agentType: string): Promise<FlywheelAgent | undefined>;
  updateFlywheelAgent(id: string, data: Partial<FlywheelAgent>): Promise<FlywheelAgent>;

  createFlywheelRecommendation(data: InsertFlywheelRecommendation): Promise<FlywheelRecommendation>;
  getFlywheelRecommendations(status?: string): Promise<FlywheelRecommendation[]>;
  updateFlywheelRecommendation(id: string, data: Partial<FlywheelRecommendation>): Promise<FlywheelRecommendation>;

  getFlywheelAutomationConfig(): Promise<FlywheelAutomationConfig | undefined>;
  upsertFlywheelAutomationConfig(data: Partial<FlywheelAutomationConfig>): Promise<FlywheelAutomationConfig>;

  createFlywheelOutcome(data: InsertFlywheelOptimizationOutcome): Promise<FlywheelOptimizationOutcome>;
  getFlywheelOutcomes(limit?: number): Promise<FlywheelOptimizationOutcome[]>;

  // Privacy Framework
  createPrivacyVault(data: InsertAgentPrivacyVault): Promise<AgentPrivacyVault>;
  getPrivacyVault(id: string): Promise<AgentPrivacyVault | undefined>;
  getPrivacyVaultByAgent(agentId: string): Promise<AgentPrivacyVault | undefined>;
  getPrivacyVaultsByOwner(ownerId: string): Promise<AgentPrivacyVault[]>;
  updatePrivacyVault(id: string, data: Partial<AgentPrivacyVault>): Promise<AgentPrivacyVault>;
  deletePrivacyVault(id: string): Promise<void>;

  createPrivacyAccessLog(data: InsertPrivacyAccessLog): Promise<PrivacyAccessLog>;
  getPrivacyAccessLogs(vaultId: string, limit?: number): Promise<PrivacyAccessLog[]>;
  getPrivacyAccessLogsByOwner(ownerId: string, limit?: number): Promise<PrivacyAccessLog[]>;

  createPrivacyViolation(data: InsertPrivacyViolation): Promise<PrivacyViolation>;
  getPrivacyViolations(vaultId?: string, limit?: number): Promise<PrivacyViolation[]>;
  getUnresolvedViolations(): Promise<PrivacyViolation[]>;
  resolvePrivacyViolation(id: string, actionTaken: string): Promise<PrivacyViolation>;

  createPrivacyGatewayRule(data: InsertPrivacyGatewayRule): Promise<PrivacyGatewayRule>;
  getPrivacyGatewayRules(): Promise<PrivacyGatewayRule[]>;
  updatePrivacyGatewayRule(id: string, data: Partial<PrivacyGatewayRule>): Promise<PrivacyGatewayRule>;
  deletePrivacyGatewayRule(id: string): Promise<void>;

  // Projects & Pipeline
  createProject(data: InsertProject): Promise<Project>;
  getProject(id: string): Promise<Project | undefined>;
  getProjects(limit?: number): Promise<Project[]>;
  getProjectByDebateId(debateId: number): Promise<Project | undefined>;
  updateProject(id: string, data: Partial<Project>): Promise<Project>;
  createProjectPackage(data: InsertProjectPackage): Promise<ProjectPackage>;
  getProjectPackages(projectId: string): Promise<ProjectPackage[]>;
  getProjectPackage(id: string): Promise<ProjectPackage | undefined>;
  createProjectAgentContribution(data: InsertProjectAgentContribution): Promise<ProjectAgentContribution>;
  getProjectAgentContributions(projectId: string): Promise<ProjectAgentContribution[]>;
  createProjectPackagePurchase(data: InsertProjectPackagePurchase): Promise<ProjectPackagePurchase>;
  hasProjectPackagePurchase(projectPackageId: string, buyerId: string): Promise<boolean>;
  createProjectValidation(data: InsertProjectValidation): Promise<ProjectValidation>;
  getProjectValidation(id: string): Promise<ProjectValidation | undefined>;
  getLatestProjectValidationForPackage(projectPackageId: string): Promise<ProjectValidation | undefined>;
  createProjectFeedback(data: InsertProjectFeedback): Promise<ProjectFeedback>;
  getProjectFeedback(projectPackageId: string): Promise<ProjectFeedback[]>;
  // Admin filter views (per-admin saved filter presets, e.g. for BroadcastPreview)
  listAdminFilterViews(ownerId: string, scope: string): Promise<AdminFilterView[]>;
  getAdminFilterView(id: string, ownerId: string): Promise<AdminFilterView | undefined>;
  createAdminFilterView(data: InsertAdminFilterView): Promise<AdminFilterView>;
  updateAdminFilterView(
    id: string,
    ownerId: string,
    data: Partial<Pick<AdminFilterView, "name" | "payload">>,
  ): Promise<AdminFilterView | undefined>;
  deleteAdminFilterView(id: string, ownerId: string): Promise<boolean>;

  // R5F — Production Assets (3D Asset Library)
  createAsset(
    input: InsertProductionAsset,
    audit: { actorUserId: string; event?: "uploaded" | "imported"; payload?: unknown },
  ): Promise<ProductionAsset>;
  getAssetById(id: string): Promise<ProductionAsset | undefined>;
  getAssetBySha256(sha256: string): Promise<ProductionAsset | undefined>;
  listAssets(opts: {
    status?: string;
    safetyReview?: string;
    approvalGate?: string;
    assetKind?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: ProductionAsset[]; total: number }>;
  updateAssetLicense(
    id: string,
    input: { licenseStatus: string; licenseSource?: string | null; licenseNote?: string | null; actorUserId: string },
  ): Promise<ProductionAsset>;
  updateAssetSafetyReview(
    id: string,
    input: { safetyReview: string; safetyNote?: string | null; actorUserId: string },
  ): Promise<ProductionAsset>;
  advanceAssetApprovalGate(id: string, input: { actorUserId: string }): Promise<ProductionAsset>;
  archiveAsset(id: string, input: { actorUserId: string; reason?: string }): Promise<ProductionAsset>;
  updateAssetKind(
    id: string,
    input: { assetKind: "rig" | "set_prop" | null; actorUserId: string; reason?: string },
  ): Promise<ProductionAsset>;
  deleteArchivedAsset(
    id: string,
    input: { actorUserId: string; reason?: string },
  ): Promise<{ asset: ProductionAsset; deletedAuditRows: number; snapshotId: string }>;
  appendAuditLog(entry: InsertProductionAssetAuditLog): Promise<ProductionAssetAuditLog>;
  listAuditLogForAsset(assetId: string, opts: { limit: number }): Promise<ProductionAssetAuditLog[]>;
  listAssetDeletionSnapshots(opts: {
    limit: number;
    offset: number;
  }): Promise<{ items: ProductionAssetDeletionSnapshot[]; total: number }>;
  getAssetDeletionSnapshotByAssetId(
    assetId: string,
  ): Promise<ProductionAssetDeletionSnapshot | undefined>;

  // Task #754 — Production Rigs (Avatar Rig Library)
  createRig(
    input: InsertProductionRig,
    audit: { actorUserId: string; event?: "uploaded" | "imported"; payload?: unknown },
  ): Promise<ProductionRig>;
  getRigById(id: string): Promise<ProductionRig | undefined>;
  getRigBySha256(sha256: string): Promise<ProductionRig | undefined>;
  listRigs(opts: {
    status?: string;
    safetyReview?: string;
    approvalGate?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: ProductionRig[]; total: number }>;
  updateRigLicense(
    id: string,
    input: { licenseStatus: string; licenseSource?: string | null; licenseNote?: string | null; actorUserId: string },
  ): Promise<ProductionRig>;
  updateRigSafetyReview(
    id: string,
    input: { safetyReview: string; safetyNote?: string | null; actorUserId: string },
  ): Promise<ProductionRig>;
  advanceRigApprovalGate(id: string, input: { actorUserId: string }): Promise<ProductionRig>;
  archiveRig(id: string, input: { actorUserId: string; reason?: string }): Promise<ProductionRig>;
  deleteArchivedRig(
    id: string,
    input: { actorUserId: string; reason?: string },
  ): Promise<{ rig: ProductionRig; deletedAuditRows: number }>;
  appendRigAuditLog(entry: InsertProductionRigAuditLog): Promise<ProductionRigAuditLog>;
  listAuditLogForRig(rigId: string, opts: { limit: number }): Promise<ProductionRigAuditLog[]>;

  // R7B — Permanent Avatars
  createPermanentAvatar(
    input: InsertPermanentAvatar,
    audit: { actorUserId: string },
  ): Promise<PermanentAvatar>;
  getPermanentAvatarById(id: string): Promise<PermanentAvatar | undefined>;
  listPermanentAvatars(opts: {
    status?: string;
    approvalGate?: string;
    identityReview?: string;
    safetyReview?: string;
    bodyAssetId?: string;
    rigId?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: PermanentAvatar[]; total: number }>;
  updatePermanentAvatarIdentityFields(
    id: string,
    input: {
      fields: Partial<{
        displayName: string;
        personaSummary: string;
        voiceProfileHint: string;
        languageHint: string;
        rolePreset: string;
        defaultRoomKind: string | null;
        defaultRoomId: string | null;
      }>;
      actorUserId: string;
    },
  ): Promise<PermanentAvatar>;
  rebindPermanentAvatar(
    id: string,
    input: {
      bodyAssetId?: string;
      rigId?: string;
      reason?: string | null;
      actorUserId: string;
    },
  ): Promise<PermanentAvatar>;
  setPermanentAvatarIdentityReview(
    id: string,
    input: { decision: string; note?: string | null; actorUserId: string },
  ): Promise<PermanentAvatar>;
  setPermanentAvatarSafetyReview(
    id: string,
    input: { decision: string; note?: string | null; actorUserId: string },
  ): Promise<PermanentAvatar>;
  advancePermanentAvatarApprovalGate(
    id: string,
    input: { actorUserId: string },
  ): Promise<PermanentAvatar>;
  archivePermanentAvatar(
    id: string,
    input: { actorUserId: string; reason?: string | null },
  ): Promise<PermanentAvatar>;
  unarchivePermanentAvatar(
    id: string,
    input: { actorUserId: string },
  ): Promise<PermanentAvatar>;
  deleteArchivedPermanentAvatar(
    id: string,
    input: { actorUserId: string; reason: string },
  ): Promise<{ deletedAuditRows: number; tombstoneId: string }>;
  appendPermanentAvatarAuditLog(
    entry: InsertPermanentAvatarAuditLog,
  ): Promise<PermanentAvatarAuditLog>;
  listPermanentAvatarAuditLog(
    id: string,
    opts: { limit: number },
  ): Promise<PermanentAvatarAuditLog[]>;
  getPermanentAvatarBoundSummaries(
    avatar: PermanentAvatar,
  ): Promise<{
    bodyAsset: ProductionAsset | null;
    rig: ProductionRig | null;
  }>;
  countPermanentAvatarsReferencingAsset(assetId: string): Promise<number>;
  countPermanentAvatarsReferencingRig(rigId: string): Promise<number>;
}

// --- R7B Permanent Avatar storage error -----------------------------
export type PermanentAvatarStorageErrorCode =
  | "avatar_not_found"
  | "avatar_slug_conflict"
  | "avatar_pair_not_approved_internal"
  | "avatar_pair_validity_failed"
  | "avatar_review_not_approved"
  | "avatar_not_archived"
  | "avatar_already_archived"
  | "avatar_invalid_state_transition"
  | "avatar_invalid_input";

export class PermanentAvatarStorageError extends Error {
  constructor(
    public code: PermanentAvatarStorageErrorCode,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "PermanentAvatarStorageError";
  }
}

export type ProductionRigStorageErrorCode =
  | "rig_not_found"
  | "rig_sha256_conflict"
  | "rig_invalid_approval_transition"
  | "rig_not_archived"
  | "rig_invalid_input";

export class ProductionRigStorageError extends Error {
  constructor(public code: ProductionRigStorageErrorCode, message: string) {
    super(message);
    this.name = "ProductionRigStorageError";
  }
}

export type ProductionAssetStorageErrorCode =
  | "asset_not_found"
  | "asset_sha256_conflict"
  | "asset_invalid_approval_transition"
  | "asset_not_archived"
  | "asset_invalid_input";

export class ProductionAssetStorageError extends Error {
  constructor(public code: ProductionAssetStorageErrorCode, message: string) {
    super(message);
    this.name = "ProductionAssetStorageError";
  }
}

// R5F — Zod schemas for every mutating production-asset method input.
// Defense-in-depth on top of the Drizzle insert schemas from R5D so
// that bad license/safety/actor inputs cannot reach the database.
import { z as zR5F } from "zod";

const r5fActorUserId = zR5F.string().trim().min(1).max(256);

const r5fLicenseStatus = zR5F.enum([
  "unknown",
  "internal_only",
  "cc0",
  "cc_by",
  "proprietary_licensed",
  "unlicensed_rejected",
]);

const r5fSafetyReview = zR5F.enum([
  "approved_internal",
  "rejected",
  "needs_changes",
]);

const r5fCreateAuditEvent = zR5F.enum(["uploaded", "imported"]);

export const updateAssetLicenseInputSchema = zR5F.object({
  licenseStatus: r5fLicenseStatus,
  licenseSource: zR5F.string().max(2048).nullish(),
  licenseNote: zR5F.string().max(2048).nullish(),
  actorUserId: r5fActorUserId,
});

export const updateAssetSafetyReviewInputSchema = zR5F.object({
  safetyReview: r5fSafetyReview,
  safetyNote: zR5F.string().max(4096).nullish(),
  actorUserId: r5fActorUserId,
});

export const advanceAssetApprovalGateInputSchema = zR5F.object({
  actorUserId: r5fActorUserId,
});

export const archiveAssetInputSchema = zR5F.object({
  actorUserId: r5fActorUserId,
  reason: zR5F.string().max(2048).optional(),
});

export const updateAssetKindInputSchema = zR5F.object({
  assetKind: zR5F.enum(["rig", "set_prop"]).nullable(),
  actorUserId: r5fActorUserId,
  reason: zR5F.string().max(2048).optional(),
});

export const deleteArchivedAssetInputSchema = zR5F.object({
  actorUserId: r5fActorUserId,
  reason: zR5F.string().max(2048).optional(),
});

export const createAssetAuditInputSchema = zR5F.object({
  actorUserId: r5fActorUserId,
  event: r5fCreateAuditEvent.optional(),
  payload: zR5F.unknown().optional(),
});

function parseR5F<T>(schema: zR5F.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ProductionAssetStorageError(
      "asset_invalid_input",
      `${label}: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

function computeRank(reputation: number): string {
  if (reputation >= 1000) return "VVIP";
  if (reputation >= 600) return "Expert";
  if (reputation >= 300) return "VIP";
  if (reputation >= 100) return "Premium";
  return "Basic";
}

export class DatabaseStorage implements IStorage {
  async getFlywheelMetrics(): Promise<FlywheelMetric[]> {
    return db.select().from(flywheelMetrics).orderBy(desc(flywheelMetrics.timestamp));
  }

  async addFlywheelMetric(metric: InsertFlywheelMetric): Promise<FlywheelMetric> {
    const [created] = await db.insert(flywheelMetrics).values(metric).returning();
    return created;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByApiToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.apiToken, token));
    return user;
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.resetToken, token));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const rank = computeRank(user.reputation || 0);
    const [created] = await db.insert(users).values({ ...user, rankLevel: rank }).returning();
    return created;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    if (data.reputation !== undefined) {
      data.rankLevel = computeRank(data.reputation);
    }
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getUsersRanked(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.reputation));
  }

  async markUserAsSpammer(userId: string): Promise<void> {
    await db.update(users).set({ isSpammer: true }).where(eq(users.id, userId));
  }

  async shadowBanUser(userId: string): Promise<void> {
    await db.update(users).set({ isShadowBanned: true }).where(eq(users.id, userId));
  }

  async unbanUser(userId: string): Promise<void> {
    await db.update(users).set({ isSpammer: false, isShadowBanned: false, spamViolations: 0, spamScore: 0 }).where(eq(users.id, userId));
  }

  async getFlaggedUsers(): Promise<User[]> {
    const result = await db.select().from(users).where(
      sql`${users.spamViolations} > 0 OR ${users.isSpammer} = true OR ${users.isShadowBanned} = true`
    );
    return result;
  }

  async createModerationLog(log: InsertModerationLog): Promise<ModerationLog> {
    const [created] = await db.insert(moderationLogs).values(log).returning();
    return created;
  }

  async getModerationLogs(limit: number = 100): Promise<ModerationLog[]> {
    return db.select().from(moderationLogs).orderBy(desc(moderationLogs.timestamp)).limit(limit);
  }

  async getModerationLogsByUser(userId: string): Promise<ModerationLog[]> {
    return db.select().from(moderationLogs).where(eq(moderationLogs.userId, userId)).orderBy(desc(moderationLogs.timestamp));
  }

  async getTopics(): Promise<Topic[]> {
    return db.select().from(topics);
  }

  async getTopicBySlug(slug: string): Promise<Topic | undefined> {
    const [topic] = await db.select().from(topics).where(eq(topics.slug, slug));
    return topic;
  }

  async createTopic(topic: InsertTopic): Promise<Topic> {
    const [created] = await db.insert(topics).values(topic).returning();
    return created;
  }

  async getPosts(): Promise<Post[]> {
    return db.select().from(posts).orderBy(desc(posts.createdAt));
  }

  async getPostsByTopic(topicSlug: string): Promise<Post[]> {
    return db.select().from(posts).where(eq(posts.topicSlug, topicSlug)).orderBy(desc(posts.createdAt));
  }

  async getPostsPaginated(options: { topic?: string; sort?: string; page?: number; limit?: number }): Promise<{ posts: Post[]; total: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 15));
    const offset = (page - 1) * limit;

    const conditions = options.topic ? eq(posts.topicSlug, options.topic) : undefined;

    let orderBy;
    switch (options.sort) {
      case "trending":
        orderBy = [desc(posts.likes), desc(posts.createdAt)];
        break;
      case "verified":
        orderBy = [desc(posts.verificationScore), desc(posts.createdAt)];
        break;
      case "latest":
      default:
        orderBy = [desc(posts.createdAt)];
        break;
    }

    const query = db.select().from(posts);
    const countQuery = db.select({ count: sql<number>`count(*)::int` }).from(posts);

    const [postsList, [{ count: total }]] = await Promise.all([
      conditions
        ? query.where(conditions).orderBy(...orderBy).limit(limit).offset(offset)
        : query.orderBy(...orderBy).limit(limit).offset(offset),
      conditions
        ? countQuery.where(conditions)
        : countQuery,
    ]);

    return { posts: postsList, total };
  }

  async getPost(id: string): Promise<Post | undefined> {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post;
  }

  async createPost(post: InsertPost): Promise<Post> {
    const [created] = await db.insert(posts).values(post).returning();
    return created;
  }

  async likePost(postId: string, userId: string): Promise<Post> {
    await db.insert(postLikes).values({ postId, userId });
    const [updated] = await db.update(posts)
      .set({ likes: sql`${posts.likes} + 1` })
      .where(eq(posts.id, postId))
      .returning();
    return updated;
  }

  async unlikePost(postId: string, userId: string): Promise<Post> {
    await db.delete(postLikes).where(
      and(eq(postLikes.postId, postId), eq(postLikes.userId, userId))
    );
    const [updated] = await db.update(posts)
      .set({ likes: sql`GREATEST(${posts.likes} - 1, 0)` })
      .where(eq(posts.id, postId))
      .returning();
    return updated;
  }

  async hasLiked(postId: string, userId: string): Promise<boolean> {
    const [like] = await db.select().from(postLikes).where(
      and(eq(postLikes.postId, postId), eq(postLikes.userId, userId))
    );
    return !!like;
  }

  async getComments(postId: string): Promise<Comment[]> {
    return db.select().from(comments).where(eq(comments.postId, postId)).orderBy(desc(comments.createdAt));
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const [created] = await db.insert(comments).values(comment).returning();
    return created;
  }

  async getCommentCount(postId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(comments).where(eq(comments.postId, postId));
    return Number(result[0]?.count || 0);
  }

  async getClaims(postId: string): Promise<Claim[]> {
    return db.select().from(claims).where(eq(claims.postId, postId));
  }

  async createClaim(claim: InsertClaim): Promise<Claim> {
    const [created] = await db.insert(claims).values(claim).returning();
    return created;
  }

  async getEvidence(postId: string): Promise<Evidence[]> {
    return db.select().from(evidence).where(eq(evidence.postId, postId));
  }

  async createEvidence(ev: InsertEvidence): Promise<Evidence> {
    const [created] = await db.insert(evidence).values(ev).returning();
    return created;
  }

  async getTrustScore(postId: string): Promise<TrustScore | undefined> {
    const [ts] = await db.select().from(trustScores).where(eq(trustScores.postId, postId));
    return ts;
  }

  async upsertTrustScore(ts: InsertTrustScore): Promise<TrustScore> {
    const existing = await this.getTrustScore(ts.postId);
    if (existing) {
      const [updated] = await db.update(trustScores).set({ ...ts, updatedAt: new Date() }).where(eq(trustScores.postId, ts.postId)).returning();
      return updated;
    }
    const [created] = await db.insert(trustScores).values(ts).returning();
    return created;
  }

  async getAgentVotes(postId: string): Promise<AgentVote[]> {
    return db.select().from(agentVotes).where(eq(agentVotes.postId, postId));
  }

  async createAgentVote(vote: InsertAgentVote): Promise<AgentVote> {
    const [created] = await db.insert(agentVotes).values(vote).returning();
    return created;
  }

  async getAgentVoteCount(postId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(agentVotes).where(eq(agentVotes.postId, postId));
    return Number(result[0]?.count || 0);
  }

  async addReputationHistory(entry: InsertReputationHistory): Promise<ReputationHistory> {
    const [created] = await db.insert(reputationHistory).values(entry).returning();
    return created;
  }

  async getReputationHistory(userId: string): Promise<ReputationHistory[]> {
    return db.select().from(reputationHistory).where(eq(reputationHistory.userId, userId)).orderBy(desc(reputationHistory.createdAt));
  }

  async getExpertiseTags(userId: string): Promise<ExpertiseTag[]> {
    return db.select().from(expertiseTags).where(eq(expertiseTags.userId, userId));
  }

  async upsertExpertiseTag(tag: InsertExpertiseTag): Promise<ExpertiseTag> {
    const existing = await db.select().from(expertiseTags).where(
      and(eq(expertiseTags.userId, tag.userId), eq(expertiseTags.topicSlug, tag.topicSlug))
    );
    if (existing.length > 0) {
      const [updated] = await db.update(expertiseTags)
        .set({ tag: tag.tag, accuracyScore: tag.accuracyScore })
        .where(and(eq(expertiseTags.userId, tag.userId), eq(expertiseTags.topicSlug, tag.topicSlug)))
        .returning();
      return updated;
    }
    const [created] = await db.insert(expertiseTags).values(tag).returning();
    return created;
  }

  async createTransaction(tx: InsertTransaction): Promise<Transaction> {
    const [created] = await db.insert(transactions).values(tx).returning();
    return created;
  }

  async getTransactions(userId: string, limit: number): Promise<Transaction[]> {
    return db.select().from(transactions)
      .where(sql`${transactions.senderId} = ${userId} OR ${transactions.receiverId} = ${userId}`)
      .orderBy(desc(transactions.createdAt))
      .limit(limit);
  }

  async getTransactionsSince(userId: string, since: Date): Promise<Transaction[]> {
    return db.select().from(transactions)
      .where(and(
        sql`${transactions.receiverId} = ${userId}`,
        sql`${transactions.createdAt} >= ${since}`
      ))
      .orderBy(desc(transactions.createdAt));
  }

  async getEconomyMetrics(): Promise<{ totalCreditsCirculating: number; totalTransactions: number; topEarners: { userId: string; total: number }[] }> {
    const circResult = await db.select({ total: sql<number>`COALESCE(SUM(${users.creditWallet}), 0)` }).from(users);
    const txCount = await db.select({ count: sql<number>`count(*)` }).from(transactions);
    const topEarners = await db.select({
      userId: transactions.receiverId,
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
    }).from(transactions)
      .where(sql`${transactions.amount} > 0`)
      .groupBy(transactions.receiverId)
      .orderBy(sql`SUM(${transactions.amount}) DESC`)
      .limit(10);
    return {
      totalCreditsCirculating: Number(circResult[0]?.total || 0),
      totalTransactions: Number(txCount[0]?.count || 0),
      topEarners: topEarners.map(e => ({ userId: e.userId, total: Number(e.total) })),
    };
  }

  async getLearningProfile(agentId: string): Promise<AgentLearningProfile | undefined> {
    const [profile] = await db.select().from(agentLearningProfiles).where(eq(agentLearningProfiles.agentId, agentId));
    return profile;
  }

  async upsertLearningProfile(agentId: string, data: Partial<AgentLearningProfile>): Promise<AgentLearningProfile> {
    const existing = await this.getLearningProfile(agentId);
    if (existing) {
      const [updated] = await db.update(agentLearningProfiles)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(agentLearningProfiles.agentId, agentId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(agentLearningProfiles)
      .values({ agentId, ...data } as any)
      .returning();
    return created;
  }

  async getAllLearningProfiles(): Promise<AgentLearningProfile[]> {
    return db.select().from(agentLearningProfiles);
  }

  async getAgentUsers(): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, "agent"));
  }

  async getRecentPosts(limit: number): Promise<Post[]> {
    return db.select().from(posts).orderBy(desc(posts.createdAt)).limit(limit);
  }

  async createAgentActivity(entry: InsertAgentActivityLog): Promise<AgentActivityLog> {
    const [created] = await db.insert(agentActivityLog).values(entry).returning();
    return created;
  }

  async getAgentActivityLog(limit: number): Promise<AgentActivityLog[]> {
    return db.select().from(agentActivityLog).orderBy(desc(agentActivityLog.createdAt)).limit(limit);
  }

  async getAgentLastActivity(agentId: string): Promise<AgentActivityLog | undefined> {
    const [last] = await db.select().from(agentActivityLog)
      .where(eq(agentActivityLog.agentId, agentId))
      .orderBy(desc(agentActivityLog.createdAt))
      .limit(1);
    return last;
  }

  async getUsersByIds(ids: string[]): Promise<Map<string, User>> {
    const map = new Map<string, User>();
    if (ids.length === 0) return map;
    const rows = await db.select().from(users).where(inArray(users.id, ids));
    for (const row of rows) map.set(row.id, row);
    return map;
  }

  async getCommentCountsByPostIds(ids: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (ids.length === 0) return map;
    const rows = await db
      .select({ postId: comments.postId, count: sql<number>`count(*)` })
      .from(comments)
      .where(inArray(comments.postId, ids))
      .groupBy(comments.postId);
    for (const r of rows) map.set(r.postId, Number(r.count || 0));
    for (const id of ids) if (!map.has(id)) map.set(id, 0);
    return map;
  }

  async getTrustScoresByPostIds(ids: string[]): Promise<Map<string, TrustScore>> {
    const map = new Map<string, TrustScore>();
    if (ids.length === 0) return map;
    const rows = await db.select().from(trustScores).where(inArray(trustScores.postId, ids));
    for (const row of rows) map.set(row.postId, row);
    return map;
  }

  async getAgentVoteCountsByPostIds(ids: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (ids.length === 0) return map;
    const rows = await db
      .select({ postId: agentVotes.postId, count: sql<number>`count(*)` })
      .from(agentVotes)
      .where(inArray(agentVotes.postId, ids))
      .groupBy(agentVotes.postId);
    for (const r of rows) map.set(r.postId, Number(r.count || 0));
    for (const id of ids) if (!map.has(id)) map.set(id, 0);
    return map;
  }

  async getClaimsByPostIds(ids: string[]): Promise<Map<string, Claim[]>> {
    const map = new Map<string, Claim[]>();
    if (ids.length === 0) return map;
    const rows = await db.select().from(claims).where(inArray(claims.postId, ids));
    for (const row of rows) {
      const list = map.get(row.postId) ?? [];
      list.push(row);
      map.set(row.postId, list);
    }
    for (const id of ids) if (!map.has(id)) map.set(id, []);
    return map;
  }

  async hasAgentActedOnPost(agentId: string, postId: string, actionType: string): Promise<boolean> {
    const [existing] = await db.select().from(agentActivityLog).where(
      and(
        eq(agentActivityLog.agentId, agentId),
        eq(agentActivityLog.postId, postId),
        eq(agentActivityLog.actionType, actionType),
      )
    );
    return !!existing;
  }

  async getAgentActionCountSince(agentId: string, since: Date): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(agentActivityLog)
      .where(and(
        eq(agentActivityLog.agentId, agentId),
        sql`${agentActivityLog.createdAt} >= ${since}`
      ));
    return Number(result[0]?.count || 0);
  }

  async getSocieties(): Promise<AgentSociety[]> {
    return db.select().from(agentSocieties).orderBy(desc(agentSocieties.reputationScore));
  }

  async getSociety(id: string): Promise<AgentSociety | undefined> {
    const [s] = await db.select().from(agentSocieties).where(eq(agentSocieties.id, id));
    return s;
  }

  async createSociety(society: InsertAgentSociety): Promise<AgentSociety> {
    const [created] = await db.insert(agentSocieties).values(society).returning();
    return created;
  }

  async updateSociety(id: string, data: Partial<AgentSociety>): Promise<AgentSociety> {
    const [updated] = await db.update(agentSocieties).set(data).where(eq(agentSocieties.id, id)).returning();
    return updated;
  }

  async getSocietyMembers(societyId: string): Promise<SocietyMember[]> {
    return db.select().from(societyMembers).where(eq(societyMembers.societyId, societyId));
  }

  async getAgentSocieties(agentId: string): Promise<SocietyMember[]> {
    return db.select().from(societyMembers).where(eq(societyMembers.agentId, agentId));
  }

  async addSocietyMember(member: InsertSocietyMember): Promise<SocietyMember> {
    const [created] = await db.insert(societyMembers).values(member).returning();
    return created;
  }

  async updateSocietyMember(id: string, data: Partial<SocietyMember>): Promise<SocietyMember> {
    const [updated] = await db.update(societyMembers).set(data).where(eq(societyMembers.id, id)).returning();
    return updated;
  }

  async getDelegatedTasks(societyId: string): Promise<DelegatedTask[]> {
    return db.select().from(delegatedTasks).where(eq(delegatedTasks.societyId, societyId)).orderBy(desc(delegatedTasks.createdAt));
  }

  async getDelegatedTasksByPost(postId: string): Promise<DelegatedTask[]> {
    return db.select().from(delegatedTasks).where(eq(delegatedTasks.postId, postId));
  }

  async getDelegatedTask(id: string): Promise<DelegatedTask | undefined> {
    const [t] = await db.select().from(delegatedTasks).where(eq(delegatedTasks.id, id));
    return t;
  }

  async createDelegatedTask(task: InsertDelegatedTask): Promise<DelegatedTask> {
    const [created] = await db.insert(delegatedTasks).values(task).returning();
    return created;
  }

  async updateDelegatedTask(id: string, data: Partial<DelegatedTask>): Promise<DelegatedTask> {
    const [updated] = await db.update(delegatedTasks).set(data).where(eq(delegatedTasks.id, id)).returning();
    return updated;
  }

  async getPendingTasksForAgent(agentId: string): Promise<DelegatedTask[]> {
    return db.select().from(delegatedTasks).where(
      and(eq(delegatedTasks.assignedAgent, agentId), eq(delegatedTasks.status, "pending"))
    );
  }

  async createAgentMessage(msg: InsertAgentMessage): Promise<AgentMessage> {
    const [created] = await db.insert(agentMessages).values(msg).returning();
    return created;
  }

  async getMessagesByTask(taskId: string): Promise<AgentMessage[]> {
    return db.select().from(agentMessages).where(eq(agentMessages.taskId, taskId)).orderBy(asc(agentMessages.createdAt));
  }

  async getMessagesBySociety(societyId: string, limit: number): Promise<AgentMessage[]> {
    return db.select().from(agentMessages).where(eq(agentMessages.societyId, societyId)).orderBy(desc(agentMessages.createdAt)).limit(limit);
  }

  async createProposal(proposal: InsertGovernanceProposal): Promise<GovernanceProposal> {
    const [created] = await db.insert(governanceProposals).values(proposal).returning();
    return created;
  }

  async getProposal(id: string): Promise<GovernanceProposal | undefined> {
    const [p] = await db.select().from(governanceProposals).where(eq(governanceProposals.id, id));
    return p;
  }

  async getProposals(status?: string): Promise<GovernanceProposal[]> {
    if (status) {
      return db.select().from(governanceProposals).where(eq(governanceProposals.status, status)).orderBy(desc(governanceProposals.createdAt));
    }
    return db.select().from(governanceProposals).orderBy(desc(governanceProposals.createdAt));
  }

  async updateProposal(id: string, data: Partial<GovernanceProposal>): Promise<GovernanceProposal> {
    const [updated] = await db.update(governanceProposals).set(data).where(eq(governanceProposals.id, id)).returning();
    return updated;
  }

  async createVote(vote: InsertGovernanceVote): Promise<GovernanceVote> {
    const [created] = await db.insert(governanceVotes).values(vote).returning();
    return created;
  }

  async getVotesByProposal(proposalId: string): Promise<GovernanceVote[]> {
    return db.select().from(governanceVotes).where(eq(governanceVotes.proposalId, proposalId)).orderBy(desc(governanceVotes.createdAt));
  }

  async hasVoted(proposalId: string, voterId: string): Promise<boolean> {
    const [existing] = await db.select().from(governanceVotes).where(
      and(eq(governanceVotes.proposalId, proposalId), eq(governanceVotes.voterId, voterId))
    );
    return !!existing;
  }

  async createAlliance(alliance: InsertAlliance): Promise<Alliance> {
    const [created] = await db.insert(alliances).values(alliance).returning();
    return created;
  }

  async getAlliance(id: string): Promise<Alliance | undefined> {
    const [a] = await db.select().from(alliances).where(eq(alliances.id, id));
    return a;
  }

  async getAlliances(): Promise<Alliance[]> {
    return db.select().from(alliances).orderBy(desc(alliances.createdAt));
  }

  async updateAlliance(id: string, data: Partial<Alliance>): Promise<Alliance> {
    const [updated] = await db.update(alliances).set(data).where(eq(alliances.id, id)).returning();
    return updated;
  }

  async addAllianceMember(member: InsertAllianceMember): Promise<AllianceMember> {
    const [created] = await db.insert(allianceMembers).values(member).returning();
    return created;
  }

  async getAllianceMembers(allianceId: string): Promise<AllianceMember[]> {
    return db.select().from(allianceMembers).where(eq(allianceMembers.allianceId, allianceId));
  }

  async getInstitutionRules(): Promise<InstitutionRule[]> {
    return db.select().from(institutionRules).orderBy(asc(institutionRules.ruleName));
  }

  async getInstitutionRule(name: string): Promise<InstitutionRule | undefined> {
    const [r] = await db.select().from(institutionRules).where(eq(institutionRules.ruleName, name));
    return r;
  }

  async upsertInstitutionRule(rule: InsertInstitutionRule): Promise<InstitutionRule> {
    const existing = await this.getInstitutionRule(rule.ruleName);
    if (existing) {
      const [updated] = await db.update(institutionRules).set({ ruleValue: rule.ruleValue, category: rule.category, lastModifiedByVote: rule.lastModifiedByVote }).where(eq(institutionRules.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(institutionRules).values(rule).returning();
    return created;
  }

  async createTaskContract(contract: InsertTaskContract): Promise<TaskContract> {
    const [created] = await db.insert(taskContracts).values(contract).returning();
    return created;
  }

  async getTaskContract(id: string): Promise<TaskContract | undefined> {
    const [c] = await db.select().from(taskContracts).where(eq(taskContracts.id, id));
    return c;
  }

  async getTaskContracts(status?: string): Promise<TaskContract[]> {
    if (status) {
      return db.select().from(taskContracts).where(eq(taskContracts.status, status)).orderBy(desc(taskContracts.createdAt));
    }
    return db.select().from(taskContracts).orderBy(desc(taskContracts.createdAt));
  }

  async updateTaskContract(id: string, data: Partial<TaskContract>): Promise<TaskContract> {
    const [updated] = await db.update(taskContracts).set(data).where(eq(taskContracts.id, id)).returning();
    return updated;
  }

  async createTaskBid(bid: InsertTaskBid): Promise<TaskBid> {
    const [created] = await db.insert(taskBids).values(bid).returning();
    return created;
  }

  async getTaskBids(contractId: string): Promise<TaskBid[]> {
    return db.select().from(taskBids).where(eq(taskBids.contractId, contractId)).orderBy(desc(taskBids.score));
  }

  async updateTaskBid(id: string, data: Partial<TaskBid>): Promise<TaskBid> {
    const [updated] = await db.update(taskBids).set(data).where(eq(taskBids.id, id)).returning();
    return updated;
  }

  async deleteSocietyMember(id: string): Promise<void> {
    await db.delete(societyMembers).where(eq(societyMembers.id, id));
  }

  async deleteSociety(id: string): Promise<void> {
    await db.delete(societyMembers).where(eq(societyMembers.societyId, id));
    await db.delete(delegatedTasks).where(eq(delegatedTasks.societyId, id));
    await db.delete(agentMessages).where(eq(agentMessages.societyId, id));
    await db.delete(agentSocieties).where(eq(agentSocieties.id, id));
  }

  async getCivilizations(): Promise<Civilization[]> {
    return db.select().from(civilizations).orderBy(desc(civilizations.createdAt));
  }

  async getCivilization(id: string): Promise<Civilization | undefined> {
    const [c] = await db.select().from(civilizations).where(eq(civilizations.id, id));
    return c;
  }

  async createCivilization(civ: InsertCivilization): Promise<Civilization> {
    const [created] = await db.insert(civilizations).values(civ).returning();
    return created;
  }

  async updateCivilization(id: string, data: Partial<Civilization>): Promise<Civilization> {
    const [updated] = await db.update(civilizations).set(data).where(eq(civilizations.id, id)).returning();
    return updated;
  }

  async getAgentIdentity(agentId: string): Promise<AgentIdentity | undefined> {
    const [identity] = await db.select().from(agentIdentities).where(eq(agentIdentities.agentId, agentId));
    return identity;
  }

  async upsertAgentIdentity(agentId: string, data: Partial<AgentIdentity>): Promise<AgentIdentity> {
    const existing = await this.getAgentIdentity(agentId);
    if (existing) {
      const [updated] = await db.update(agentIdentities).set({ ...data, updatedAt: new Date() }).where(eq(agentIdentities.agentId, agentId)).returning();
      return updated;
    }
    const [created] = await db.insert(agentIdentities).values({ agentId, ...data } as any).returning();
    return created;
  }

  async getAgentIdentities(): Promise<AgentIdentity[]> {
    return db.select().from(agentIdentities).orderBy(desc(agentIdentities.influenceScore));
  }

  async getIdentitiesByCivilization(civilizationId: string): Promise<AgentIdentity[]> {
    return db.select().from(agentIdentities).where(eq(agentIdentities.civilizationId, civilizationId));
  }

  async addAgentMemory(entry: InsertAgentMemory): Promise<AgentMemory> {
    const [created] = await db.insert(agentMemory).values(entry).returning();
    return created;
  }

  async getAgentMemories(agentId: string, limit: number): Promise<AgentMemory[]> {
    return db.select().from(agentMemory).where(eq(agentMemory.agentId, agentId)).orderBy(desc(agentMemory.createdAt)).limit(limit);
  }

  async getAgentMemoriesByType(agentId: string, eventType: string, limit: number): Promise<AgentMemory[]> {
    return db.select().from(agentMemory).where(
      and(eq(agentMemory.agentId, agentId), eq(agentMemory.eventType, eventType))
    ).orderBy(desc(agentMemory.createdAt)).limit(limit);
  }

  async createInvestment(inv: InsertCivilizationInvestment): Promise<CivilizationInvestment> {
    const [created] = await db.insert(civilizationInvestments).values(inv).returning();
    return created;
  }

  async getInvestments(civilizationId: string): Promise<CivilizationInvestment[]> {
    return db.select().from(civilizationInvestments).where(eq(civilizationInvestments.civilizationId, civilizationId)).orderBy(desc(civilizationInvestments.createdAt));
  }

  async getActiveInvestments(): Promise<CivilizationInvestment[]> {
    return db.select().from(civilizationInvestments).where(eq(civilizationInvestments.status, "active")).orderBy(asc(civilizationInvestments.maturesAt));
  }

  async updateInvestment(id: string, data: Partial<CivilizationInvestment>): Promise<CivilizationInvestment> {
    const [updated] = await db.update(civilizationInvestments).set(data).where(eq(civilizationInvestments.id, id)).returning();
    return updated;
  }

  async getAgentGenome(agentId: string): Promise<AgentGenome | undefined> {
    const [genome] = await db.select().from(agentGenomes).where(eq(agentGenomes.agentId, agentId));
    return genome;
  }

  async upsertAgentGenome(agentId: string, data: Partial<AgentGenome>): Promise<AgentGenome> {
    const existing = await this.getAgentGenome(agentId);
    if (existing) {
      const [updated] = await db.update(agentGenomes).set({ ...data, updatedAt: new Date() }).where(eq(agentGenomes.agentId, agentId)).returning();
      return updated;
    }
    const [created] = await db.insert(agentGenomes).values({ agentId, ...data } as any).returning();
    return created;
  }

  async getAllGenomes(): Promise<AgentGenome[]> {
    return db.select().from(agentGenomes).orderBy(desc(agentGenomes.fitnessScore));
  }

  async getAgentLineage(agentId: string): Promise<AgentLineage | undefined> {
    const [entry] = await db.select().from(agentLineage).where(eq(agentLineage.agentId, agentId));
    return entry;
  }

  async createAgentLineage(entry: InsertAgentLineage): Promise<AgentLineage> {
    const [created] = await db.insert(agentLineage).values(entry).returning();
    return created;
  }

  async updateAgentLineage(agentId: string, data: Partial<AgentLineage>): Promise<AgentLineage> {
    const [updated] = await db.update(agentLineage).set(data).where(eq(agentLineage.agentId, agentId)).returning();
    return updated;
  }

  async getLineageByParent(parentId: string): Promise<AgentLineage[]> {
    return db.select().from(agentLineage).where(eq(agentLineage.parentAgentId, parentId)).orderBy(desc(agentLineage.bornAt));
  }

  async getAllLineages(): Promise<AgentLineage[]> {
    return db.select().from(agentLineage).orderBy(asc(agentLineage.generationNumber));
  }

  async createCulturalMemoryEntry(entry: InsertCulturalMemory): Promise<CulturalMemory> {
    const [created] = await db.insert(culturalMemory).values(entry).returning();
    return created;
  }

  async getCulturalMemories(limit: number): Promise<CulturalMemory[]> {
    return db.select().from(culturalMemory).orderBy(desc(culturalMemory.successScore)).limit(limit);
  }

  async getTopCulturalMemories(domain: string, limit: number): Promise<CulturalMemory[]> {
    return db.select().from(culturalMemory).where(eq(culturalMemory.domain, domain)).orderBy(desc(culturalMemory.successScore)).limit(limit);
  }

  async updateCulturalMemory(id: string, data: Partial<CulturalMemory>): Promise<CulturalMemory> {
    const [updated] = await db.update(culturalMemory).set(data).where(eq(culturalMemory.id, id)).returning();
    return updated;
  }

  async getEthicalProfile(entityId: string): Promise<EthicalProfile | undefined> {
    const [profile] = await db.select().from(ethicalProfiles).where(eq(ethicalProfiles.entityId, entityId));
    return profile;
  }

  async upsertEthicalProfile(entityId: string, data: Partial<EthicalProfile>): Promise<EthicalProfile> {
    const existing = await this.getEthicalProfile(entityId);
    if (existing) {
      const [updated] = await db.update(ethicalProfiles).set({ ...data, updatedAt: new Date() }).where(eq(ethicalProfiles.entityId, entityId)).returning();
      return updated;
    }
    const [created] = await db.insert(ethicalProfiles).values({ entityId, ...data } as any).returning();
    return created;
  }

  async getAllEthicalProfiles(): Promise<EthicalProfile[]> {
    return db.select().from(ethicalProfiles).orderBy(desc(ethicalProfiles.ethicalScore));
  }

  async createEthicalRule(rule: InsertEthicalRule): Promise<EthicalRule> {
    const [created] = await db.insert(ethicalRules).values(rule).returning();
    return created;
  }

  async getEthicalRule(id: string): Promise<EthicalRule | undefined> {
    const [rule] = await db.select().from(ethicalRules).where(eq(ethicalRules.id, id));
    return rule;
  }

  async getEthicalRules(status?: string): Promise<EthicalRule[]> {
    if (status) {
      return db.select().from(ethicalRules).where(eq(ethicalRules.adoptionStatus, status)).orderBy(desc(ethicalRules.createdAt));
    }
    return db.select().from(ethicalRules).orderBy(desc(ethicalRules.createdAt));
  }

  async updateEthicalRule(id: string, data: Partial<EthicalRule>): Promise<EthicalRule> {
    const [updated] = await db.update(ethicalRules).set(data).where(eq(ethicalRules.id, id)).returning();
    return updated;
  }

  async createEthicalEvent(event: InsertEthicalEvent): Promise<EthicalEvent> {
    const [created] = await db.insert(ethicalEvents).values(event).returning();
    return created;
  }

  async getEthicalEvents(limit: number): Promise<EthicalEvent[]> {
    return db.select().from(ethicalEvents).orderBy(desc(ethicalEvents.createdAt)).limit(limit);
  }

  async getEthicalEventsByActor(actorId: string, limit: number): Promise<EthicalEvent[]> {
    return db.select().from(ethicalEvents).where(eq(ethicalEvents.actorId, actorId)).orderBy(desc(ethicalEvents.createdAt)).limit(limit);
  }

  async createGlobalMetrics(metrics: InsertGlobalMetrics): Promise<GlobalMetrics> {
    const [created] = await db.insert(globalMetrics).values(metrics).returning();
    return created;
  }

  async getLatestGlobalMetrics(): Promise<GlobalMetrics | undefined> {
    const [latest] = await db.select().from(globalMetrics).orderBy(desc(globalMetrics.createdAt)).limit(1);
    return latest;
  }

  async getGlobalMetricsHistory(limit: number): Promise<GlobalMetrics[]> {
    return db.select().from(globalMetrics).orderBy(desc(globalMetrics.createdAt)).limit(limit);
  }

  async upsertGlobalGoalField(data: Partial<GlobalGoalField>): Promise<GlobalGoalField> {
    const existing = await this.getLatestGoalField();
    if (existing) {
      const [updated] = await db.update(globalGoalField).set({ ...data, updatedAt: new Date() }).where(eq(globalGoalField.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(globalGoalField).values(data as any).returning();
    return created;
  }

  async getLatestGoalField(): Promise<GlobalGoalField | undefined> {
    const [latest] = await db.select().from(globalGoalField).orderBy(desc(globalGoalField.updatedAt)).limit(1);
    return latest;
  }

  async createGlobalInsight(insight: InsertGlobalInsight): Promise<GlobalInsight> {
    const [created] = await db.insert(globalInsights).values(insight).returning();
    return created;
  }

  async getGlobalInsight(id: string): Promise<GlobalInsight | undefined> {
    const [insight] = await db.select().from(globalInsights).where(eq(globalInsights.id, id));
    return insight;
  }

  async getGlobalInsights(status?: string): Promise<GlobalInsight[]> {
    if (status) {
      return db.select().from(globalInsights).where(eq(globalInsights.status, status)).orderBy(desc(globalInsights.createdAt));
    }
    return db.select().from(globalInsights).orderBy(desc(globalInsights.createdAt));
  }

  async updateGlobalInsight(id: string, data: Partial<GlobalInsight>): Promise<GlobalInsight> {
    const [updated] = await db.update(globalInsights).set(data).where(eq(globalInsights.id, id)).returning();
    return updated;
  }

  async createLiveDebate(debate: InsertLiveDebate): Promise<LiveDebate> {
    const [created] = await db.insert(liveDebates).values(debate).returning();
    return created;
  }

  async getLiveDebate(id: number): Promise<LiveDebate | undefined> {
    const [debate] = await db.select().from(liveDebates).where(eq(liveDebates.id, id));
    return debate;
  }

  async getLiveDebates(status?: string): Promise<LiveDebate[]> {
    if (status) {
      return db.select().from(liveDebates).where(eq(liveDebates.status, status)).orderBy(desc(liveDebates.createdAt));
    }
    return db.select().from(liveDebates).orderBy(desc(liveDebates.createdAt));
  }

  async updateLiveDebate(id: number, data: Partial<LiveDebate>): Promise<LiveDebate> {
    const [updated] = await db.update(liveDebates).set(data).where(eq(liveDebates.id, id)).returning();
    return updated;
  }

  async addDebateParticipant(participant: InsertDebateParticipant): Promise<DebateParticipant> {
    const [created] = await db.insert(debateParticipants).values(participant).returning();
    return created;
  }

  async getDebateParticipants(debateId: number): Promise<DebateParticipant[]> {
    return db.select().from(debateParticipants).where(eq(debateParticipants.debateId, debateId)).orderBy(asc(debateParticipants.speakingOrder));
  }

  async getDebateParticipant(id: number): Promise<DebateParticipant | undefined> {
    const [p] = await db.select().from(debateParticipants).where(eq(debateParticipants.id, id));
    return p;
  }

  async updateDebateParticipant(id: number, data: Partial<DebateParticipant>): Promise<DebateParticipant> {
    const [updated] = await db.update(debateParticipants).set(data).where(eq(debateParticipants.id, id)).returning();
    return updated;
  }

  async removeDebateParticipant(id: number): Promise<void> {
    await db.delete(debateParticipants).where(eq(debateParticipants.id, id));
  }

  async createDebateTurn(turn: InsertDebateTurn): Promise<DebateTurn> {
    const [created] = await db.insert(debateTurns).values(turn).returning();
    return created;
  }

  async getDebateTurns(debateId: number): Promise<DebateTurn[]> {
    return db.select().from(debateTurns).where(eq(debateTurns.debateId, debateId)).orderBy(asc(debateTurns.roundNumber), asc(debateTurns.turnOrder));
  }

  async getDebateTurn(id: number): Promise<DebateTurn | undefined> {
    const [turn] = await db.select().from(debateTurns).where(eq(debateTurns.id, id));
    return turn;
  }

  async updateDebateTurn(id: number, data: Partial<DebateTurn>): Promise<DebateTurn> {
    const [updated] = await db.update(debateTurns).set(data).where(eq(debateTurns.id, id)).returning();
    return updated;
  }

  async createFlywheelJob(job: InsertFlywheelJob): Promise<FlywheelJob> {
    const [created] = await db.insert(flywheelJobs).values(job).returning();
    return created;
  }

  async getFlywheelJob(id: number): Promise<FlywheelJob | undefined> {
    const [job] = await db.select().from(flywheelJobs).where(eq(flywheelJobs.id, id));
    return job;
  }

  async getFlywheelJobs(): Promise<FlywheelJob[]> {
    return db.select().from(flywheelJobs).orderBy(desc(flywheelJobs.createdAt));
  }

  async getFlywheelJobByDebate(debateId: number): Promise<FlywheelJob | undefined> {
    const [job] = await db.select().from(flywheelJobs).where(eq(flywheelJobs.debateId, debateId));
    return job;
  }

  async updateFlywheelJob(id: number, data: Partial<FlywheelJob>): Promise<FlywheelJob> {
    const [updated] = await db.update(flywheelJobs).set(data).where(eq(flywheelJobs.id, id)).returning();
    return updated;
  }

  async createGeneratedClip(clip: InsertGeneratedClip): Promise<GeneratedClip> {
    const [created] = await db.insert(generatedClips).values(clip).returning();
    return created;
  }

  async getGeneratedClip(id: number): Promise<GeneratedClip | undefined> {
    const [clip] = await db.select().from(generatedClips).where(eq(generatedClips.id, id));
    return clip;
  }

  async getClipsByJob(jobId: number): Promise<GeneratedClip[]> {
    return db.select().from(generatedClips).where(eq(generatedClips.jobId, jobId)).orderBy(asc(generatedClips.id));
  }

  async getClipsByDebate(debateId: number): Promise<GeneratedClip[]> {
    return db.select().from(generatedClips).where(eq(generatedClips.debateId, debateId)).orderBy(asc(generatedClips.id));
  }

  async updateGeneratedClip(id: number, data: Partial<GeneratedClip>): Promise<GeneratedClip> {
    const [updated] = await db.update(generatedClips).set(data).where(eq(generatedClips.id, id)).returning();
    return updated;
  }

  async createNewsArticle(article: InsertNewsArticle): Promise<NewsArticle> {
    const [created] = await db.insert(newsArticles).values(article).returning();
    return created;
  }

  async getNewsArticle(id: number): Promise<NewsArticle | undefined> {
    const [article] = await db.select().from(newsArticles).where(eq(newsArticles.id, id));
    return article;
  }

  async getNewsArticleBySlug(slug: string): Promise<NewsArticle | undefined> {
    const [article] = await db.select().from(newsArticles).where(eq(newsArticles.slug, slug));
    return article;
  }

  async getNewsArticles(limit: number, category?: string, offset?: number): Promise<NewsArticle[]> {
    const conditions = [eq(newsArticles.status, "processed")];
    if (category) conditions.push(eq(newsArticles.category, category));
    return db.select().from(newsArticles)
      .where(and(...conditions))
      .orderBy(desc(newsArticles.publishedAt))
      .limit(limit)
      .offset(offset || 0);
  }

  async getNewsArticleByUrl(sourceUrl: string): Promise<NewsArticle | undefined> {
    const [article] = await db.select().from(newsArticles).where(eq(newsArticles.sourceUrl, sourceUrl));
    return article;
  }

  async getNewsArticleByTitleHash(titleHash: string): Promise<NewsArticle | undefined> {
    const [article] = await db.select().from(newsArticles).where(eq(newsArticles.titleHash, titleHash));
    return article;
  }

  async countNewsArticles(category?: string): Promise<number> {
    const conditions = [eq(newsArticles.status, "processed")];
    if (category) conditions.push(eq(newsArticles.category, category));
    const result = await db.select({ count: sql<number>`count(*)` }).from(newsArticles).where(and(...conditions));
    return Number(result[0]?.count || 0);
  }

  async getLatestNews(limit: number): Promise<NewsArticle[]> {
    return db.select().from(newsArticles)
      .where(eq(newsArticles.status, "processed"))
      .orderBy(desc(newsArticles.publishedAt))
      .limit(limit);
  }

  async updateNewsArticle(id: number, data: Partial<NewsArticle>): Promise<NewsArticle> {
    const [updated] = await db.update(newsArticles).set(data).where(eq(newsArticles.id, id)).returning();
    return updated;
  }

  async listNewsSources(opts?: { enabledOnly?: boolean; activeOnly?: boolean }): Promise<NewsSource[]> {
    const conditions: any[] = [];
    if (opts?.enabledOnly) conditions.push(eq(newsSources.enabled, true));
    if (opts?.activeOnly) {
      conditions.push(eq(newsSources.enabled, true));
      conditions.push(sql`${newsSources.licenseStatus} <> 'unknown'`);
    }
    const q = db.select().from(newsSources);
    const rows = conditions.length
      ? await q.where(and(...conditions)).orderBy(asc(newsSources.name))
      : await q.orderBy(asc(newsSources.name));
    return rows;
  }

  async getNewsSource(id: string): Promise<NewsSource | undefined> {
    const [row] = await db.select().from(newsSources).where(eq(newsSources.id, id));
    return row;
  }

  async getNewsSourceByUrl(url: string): Promise<NewsSource | undefined> {
    const [row] = await db.select().from(newsSources).where(eq(newsSources.url, url));
    return row;
  }

  async createNewsSource(source: InsertNewsSource): Promise<NewsSource> {
    const [created] = await db.insert(newsSources).values(source).returning();
    return created;
  }

  async updateNewsSource(id: string, data: Partial<InsertNewsSource>): Promise<NewsSource> {
    const patch: Partial<typeof newsSources.$inferInsert> = { ...data, updatedAt: new Date() };
    const [updated] = await db.update(newsSources)
      .set(patch)
      .where(eq(newsSources.id, id))
      .returning();
    return updated;
  }

  async disableNewsSource(id: string): Promise<NewsSource> {
    const patch: Partial<typeof newsSources.$inferInsert> = { enabled: false, updatedAt: new Date() };
    const [updated] = await db.update(newsSources)
      .set(patch)
      .where(eq(newsSources.id, id))
      .returning();
    return updated;
  }

  async recordNewsSourceHealthCheck(
    id: string,
    data: {
      status: "ok" | "warning" | "error";
      httpStatus: number | null;
      itemCount: number | null;
      errorMessage: string | null;
      incrementFailure: boolean;
      resetFailure: boolean;
    },
  ): Promise<NewsSource | undefined> {
    const [current] = await db.select().from(newsSources).where(eq(newsSources.id, id));
    if (!current) return undefined;
    const consecutiveFailures = data.resetFailure
      ? 0
      : data.incrementFailure
        ? (current.consecutiveFailures ?? 0) + 1
        : (current.consecutiveFailures ?? 0);
    const [updated] = await db.update(newsSources)
      .set({
        lastCheckedAt: new Date(),
        lastCheckStatus: data.status,
        lastCheckItemCount: data.itemCount,
        lastCheckHttpStatus: data.httpStatus,
        lastCheckError: data.errorMessage,
        consecutiveFailures,
      })
      .where(eq(newsSources.id, id))
      .returning();
    return updated;
  }

  async getUnprocessedNews(limit: number): Promise<NewsArticle[]> {
    return db.select().from(newsArticles)
      .where(eq(newsArticles.status, "raw"))
      .orderBy(asc(newsArticles.createdAt))
      .limit(limit);
  }

  async getBreakingNews(): Promise<NewsArticle[]> {
    return db.select().from(newsArticles)
      .where(and(eq(newsArticles.isBreakingNews, true), eq(newsArticles.status, "processed")))
      .orderBy(desc(newsArticles.publishedAt))
      .limit(10);
  }

  async createNewsComment(comment: InsertNewsComment): Promise<NewsComment> {
    const [created] = await db.insert(newsComments).values(comment).returning();
    await db.update(newsArticles)
      .set({ commentsCount: sql`comments_count + 1` })
      .where(eq(newsArticles.id, comment.articleId));
    return created;
  }

  async getNewsComments(articleId: number): Promise<NewsComment[]> {
    return db.select().from(newsComments)
      .where(and(eq(newsComments.articleId, articleId), sql`${newsComments.parentId} IS NULL`))
      .orderBy(desc(newsComments.createdAt));
  }

  async getNewsCommentReplies(parentId: number): Promise<NewsComment[]> {
    return db.select().from(newsComments)
      .where(eq(newsComments.parentId, parentId))
      .orderBy(asc(newsComments.createdAt));
  }

  async likeNewsComment(commentId: number): Promise<void> {
    await db.update(newsComments)
      .set({ likes: sql`likes + 1` })
      .where(eq(newsComments.id, commentId));
  }

  async toggleNewsReaction(articleId: number, userId: string, reactionType: string): Promise<boolean> {
    const existing = await this.getNewsReaction(articleId, userId);
    if (existing) {
      await db.delete(newsReactions).where(eq(newsReactions.id, existing.id));
      await db.update(newsArticles)
        .set({ likesCount: sql`GREATEST(likes_count - 1, 0)` })
        .where(eq(newsArticles.id, articleId));
      return false;
    }
    await db.insert(newsReactions).values({ articleId, userId, reactionType });
    await db.update(newsArticles)
      .set({ likesCount: sql`likes_count + 1` })
      .where(eq(newsArticles.id, articleId));
    return true;
  }

  async getNewsReaction(articleId: number, userId: string): Promise<NewsReaction | undefined> {
    const [reaction] = await db.select().from(newsReactions)
      .where(and(eq(newsReactions.articleId, articleId), eq(newsReactions.userId, userId)));
    return reaction;
  }

  async getNewsReactionCount(articleId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(newsReactions)
      .where(eq(newsReactions.articleId, articleId));
    return Number(result[0]?.count || 0);
  }

  async createNewsShare(share: InsertNewsShare): Promise<NewsShare> {
    const [created] = await db.insert(newsShares).values(share).returning();
    await db.update(newsArticles)
      .set({ sharesCount: sql`shares_count + 1` })
      .where(eq(newsArticles.id, share.articleId));
    return created;
  }

  async getNewsShareCount(articleId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(newsShares)
      .where(eq(newsShares.articleId, articleId));
    return Number(result[0]?.count || 0);
  }

  async createSocialAccount(account: InsertSocialAccount): Promise<SocialAccount> {
    const [created] = await db.insert(socialAccounts).values(account).returning();
    return created;
  }

  async getSocialAccounts(): Promise<SocialAccount[]> {
    return db.select().from(socialAccounts).orderBy(desc(socialAccounts.createdAt));
  }

  async getSocialAccount(id: number): Promise<SocialAccount | undefined> {
    const [account] = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id));
    return account;
  }

  async updateSocialAccount(id: number, data: Partial<SocialAccount>): Promise<SocialAccount> {
    const [updated] = await db.update(socialAccounts).set({ ...data, updatedAt: new Date() }).where(eq(socialAccounts.id, id)).returning();
    return updated;
  }

  async deleteSocialAccount(id: number): Promise<void> {
    await db.delete(socialAccounts).where(eq(socialAccounts.id, id));
  }

  async getActiveSocialAccounts(platform?: string): Promise<SocialAccount[]> {
    if (platform) {
      return db.select().from(socialAccounts)
        .where(and(eq(socialAccounts.isActive, true), eq(socialAccounts.platform, platform)));
    }
    return db.select().from(socialAccounts).where(eq(socialAccounts.isActive, true));
  }

  async createSocialPost(post: InsertSocialPost): Promise<SocialPost> {
    const [created] = await db.insert(socialPosts).values(post).returning();
    return created;
  }

  async getSocialPosts(limit = 50, status?: string): Promise<SocialPost[]> {
    if (status) {
      return db.select().from(socialPosts)
        .where(eq(socialPosts.status, status))
        .orderBy(desc(socialPosts.createdAt)).limit(limit);
    }
    return db.select().from(socialPosts).orderBy(desc(socialPosts.createdAt)).limit(limit);
  }

  async getSocialPost(id: number): Promise<SocialPost | undefined> {
    const [post] = await db.select().from(socialPosts).where(eq(socialPosts.id, id));
    return post;
  }

  async updateSocialPost(id: number, data: Partial<SocialPost>): Promise<SocialPost> {
    const [updated] = await db.update(socialPosts).set(data).where(eq(socialPosts.id, id)).returning();
    return updated;
  }

  async getPendingSocialPosts(): Promise<SocialPost[]> {
    return db.select().from(socialPosts)
      .where(eq(socialPosts.status, "pending"))
      .orderBy(asc(socialPosts.createdAt));
  }

  async getSocialPostsByContent(contentType: string, contentId: string): Promise<SocialPost[]> {
    return db.select().from(socialPosts)
      .where(and(eq(socialPosts.contentType, contentType), eq(socialPosts.contentId, contentId)));
  }

  async createPromotionScore(score: InsertPromotionScore): Promise<PromotionScore> {
    const [created] = await db.insert(promotionScores).values(score).returning();
    return created;
  }

  async getPromotionScores(limit = 50, status?: string): Promise<PromotionScore[]> {
    if (status) {
      return db.select().from(promotionScores)
        .where(eq(promotionScores.status, status))
        .orderBy(desc(promotionScores.evaluatedAt)).limit(limit);
    }
    return db.select().from(promotionScores).orderBy(desc(promotionScores.evaluatedAt)).limit(limit);
  }

  async getPromotionScore(id: number): Promise<PromotionScore | undefined> {
    const [score] = await db.select().from(promotionScores).where(eq(promotionScores.id, id));
    return score;
  }

  async getPromotionScoreByContent(contentType: string, contentId: string): Promise<PromotionScore | undefined> {
    const [score] = await db.select().from(promotionScores)
      .where(and(eq(promotionScores.contentType, contentType), eq(promotionScores.contentId, contentId)));
    return score;
  }

  async updatePromotionScore(id: number, data: Partial<PromotionScore>): Promise<PromotionScore> {
    const [updated] = await db.update(promotionScores).set(data).where(eq(promotionScores.id, id)).returning();
    return updated;
  }

  async getPendingReviewPromotions(): Promise<PromotionScore[]> {
    return db.select().from(promotionScores)
      .where(eq(promotionScores.decision, "review"))
      .orderBy(desc(promotionScores.totalScore));
  }

  async createSocialPerformance(perf: InsertSocialPerformance): Promise<SocialPerformance> {
    const [created] = await db.insert(socialPerformance).values(perf).returning();
    return created;
  }

  async getSocialPerformance(limit = 50): Promise<SocialPerformance[]> {
    return db.select().from(socialPerformance)
      .orderBy(desc(socialPerformance.collectedAt)).limit(limit);
  }

  async getSocialPerformanceByPlatform(platform: string, limit = 50): Promise<SocialPerformance[]> {
    return db.select().from(socialPerformance)
      .where(eq(socialPerformance.platform, platform))
      .orderBy(desc(socialPerformance.collectedAt)).limit(limit);
  }

  async getSocialPerformanceSince(since: Date): Promise<SocialPerformance[]> {
    return db.select().from(socialPerformance)
      .where(sql`${socialPerformance.collectedAt} >= ${since}`)
      .orderBy(desc(socialPerformance.collectedAt));
  }

  async getTopViralPosts(limit = 10): Promise<SocialPerformance[]> {
    return db.select().from(socialPerformance)
      .orderBy(desc(socialPerformance.viralScore)).limit(limit);
  }

  async createGrowthPattern(pattern: InsertGrowthPattern): Promise<GrowthPattern> {
    const [created] = await db.insert(growthPatterns).values(pattern).returning();
    return created;
  }

  async getGrowthPatterns(platform?: string): Promise<GrowthPattern[]> {
    if (platform) {
      return db.select().from(growthPatterns)
        .where(eq(growthPatterns.platform, platform))
        .orderBy(desc(growthPatterns.learnedAt));
    }
    return db.select().from(growthPatterns).orderBy(desc(growthPatterns.learnedAt));
  }

  async getActiveGrowthPatterns(platform?: string): Promise<GrowthPattern[]> {
    if (platform) {
      return db.select().from(growthPatterns)
        .where(and(eq(growthPatterns.isActive, true), eq(growthPatterns.platform, platform)))
        .orderBy(desc(growthPatterns.confidence));
    }
    return db.select().from(growthPatterns)
      .where(eq(growthPatterns.isActive, true))
      .orderBy(desc(growthPatterns.confidence));
  }

  async getGrowthPattern(id: number): Promise<GrowthPattern | undefined> {
    const [pattern] = await db.select().from(growthPatterns).where(eq(growthPatterns.id, id));
    return pattern;
  }

  async updateGrowthPattern(id: number, data: Partial<GrowthPattern>): Promise<GrowthPattern> {
    const [updated] = await db.update(growthPatterns).set(data).where(eq(growthPatterns.id, id)).returning();
    return updated;
  }

  async getSystemControlConfigs(): Promise<SystemControlConfig[]> {
    return db.select().from(systemControlConfig).orderBy(asc(systemControlConfig.category), asc(systemControlConfig.key));
  }

  async getSystemControlConfig(key: string): Promise<SystemControlConfig | undefined> {
    const [config] = await db.select().from(systemControlConfig).where(eq(systemControlConfig.key, key));
    return config;
  }

  async upsertSystemControlConfig(data: InsertSystemControlConfig): Promise<SystemControlConfig> {
    const existing = await this.getSystemControlConfig(data.key);
    if (existing) {
      const [updated] = await db.update(systemControlConfig)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(systemControlConfig.key, data.key))
        .returning();
      return updated;
    }
    const [created] = await db.insert(systemControlConfig).values(data).returning();
    return created;
  }

  async updateSystemControlValue(key: string, value: number): Promise<SystemControlConfig> {
    const [updated] = await db.update(systemControlConfig)
      .set({ value, updatedAt: new Date() })
      .where(eq(systemControlConfig.key, key))
      .returning();
    return updated;
  }

  async recordActivityMetric(metric: InsertActivityMetric): Promise<ActivityMetric> {
    const [created] = await db.insert(activityMetrics).values(metric).returning();
    return created;
  }

  async getActivityMetrics(metricKey: string, since?: Date): Promise<ActivityMetric[]> {
    if (since) {
      return db.select().from(activityMetrics)
        .where(and(eq(activityMetrics.metricKey, metricKey), gte(activityMetrics.observedAt, since)))
        .orderBy(desc(activityMetrics.observedAt));
    }
    return db.select().from(activityMetrics)
      .where(eq(activityMetrics.metricKey, metricKey))
      .orderBy(desc(activityMetrics.observedAt))
      .limit(100);
  }

  async getLatestMetrics(): Promise<ActivityMetric[]> {
    const result = await db.execute(sql`
      SELECT DISTINCT ON (metric_key) * FROM activity_metrics
      ORDER BY metric_key, observed_at DESC
    `);
    return (result as any).rows || [];
  }

  async createAnomalyEvent(event: InsertAnomalyEvent): Promise<AnomalyEvent> {
    const [created] = await db.insert(anomalyEvents).values(event).returning();
    return created;
  }

  async getOpenAnomalies(): Promise<AnomalyEvent[]> {
    return db.select().from(anomalyEvents)
      .where(eq(anomalyEvents.status, "open"))
      .orderBy(desc(anomalyEvents.detectedAt));
  }

  async getAllAnomalies(limit = 50): Promise<AnomalyEvent[]> {
    return db.select().from(anomalyEvents)
      .orderBy(desc(anomalyEvents.detectedAt))
      .limit(limit);
  }

  async updateAnomalyStatus(id: number, status: string, resolvedAt?: Date): Promise<AnomalyEvent> {
    const [updated] = await db.update(anomalyEvents)
      .set({ status, resolvedAt: resolvedAt || new Date() })
      .where(eq(anomalyEvents.id, id))
      .returning();
    return updated;
  }

  async createAutomationDecision(decision: InsertAutomationDecision): Promise<AutomationDecision> {
    const [created] = await db.insert(automationDecisions).values(decision).returning();
    return created;
  }

  async getPendingDecisions(): Promise<AutomationDecision[]> {
    return db.select().from(automationDecisions)
      .where(eq(automationDecisions.status, "pending"))
      .orderBy(desc(automationDecisions.requestedAt));
  }

  async getAllDecisions(limit = 50): Promise<AutomationDecision[]> {
    return db.select().from(automationDecisions)
      .orderBy(desc(automationDecisions.requestedAt))
      .limit(limit);
  }

  async resolveDecision(id: number, status: string, resolvedBy: string): Promise<AutomationDecision> {
    const [updated] = await db.update(automationDecisions)
      .set({ status, resolvedBy, resolvedAt: new Date() })
      .where(eq(automationDecisions.id, id))
      .returning();
    return updated;
  }

  async getAutomationPolicy(): Promise<AutomationPolicy | undefined> {
    const [policy] = await db.select().from(automationPolicy).limit(1);
    return policy;
  }

  async upsertAutomationPolicy(data: Partial<InsertAutomationPolicy>): Promise<AutomationPolicy> {
    const existing = await this.getAutomationPolicy();
    if (existing) {
      const [updated] = await db.update(automationPolicy)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(automationPolicy.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(automationPolicy).values({
      mode: data.mode || "autopilot",
      safeMode: data.safeMode || false,
      killSwitch: data.killSwitch || false,
    }).returning();
    return created;
  }
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.sortOrder));
  }

  async getSubscriptionPlan(id: string): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id));
    return plan;
  }

  async getSubscriptionPlanByName(name: string): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, name));
    return plan;
  }

  async createSubscriptionPlan(plan: InsertSubscriptionPlan): Promise<SubscriptionPlan> {
    const [created] = await db.insert(subscriptionPlans).values(plan).returning();
    return created;
  }

  async getUserSubscription(userId: string): Promise<UserSubscription | undefined> {
    const [sub] = await db.select().from(userSubscriptions)
      .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
      .orderBy(desc(userSubscriptions.createdAt))
      .limit(1);
    return sub;
  }

  async createUserSubscription(sub: InsertUserSubscription): Promise<UserSubscription> {
    const [created] = await db.insert(userSubscriptions).values(sub).returning();
    return created;
  }

  async updateUserSubscription(id: string, data: Partial<UserSubscription>): Promise<UserSubscription> {
    const [updated] = await db.update(userSubscriptions).set({ ...data, updatedAt: new Date() }).where(eq(userSubscriptions.id, id)).returning();
    return updated;
  }

  async getCreditPackages(): Promise<CreditPackage[]> {
    return db.select().from(creditPackages).where(eq(creditPackages.isActive, true));
  }

  async createCreditPackage(pkg: InsertCreditPackage): Promise<CreditPackage> {
    const [created] = await db.insert(creditPackages).values(pkg).returning();
    return created;
  }

  async createCreditPurchase(purchase: InsertCreditPurchase): Promise<CreditPurchase> {
    const [created] = await db.insert(creditPurchases).values(purchase).returning();
    return created;
  }

  async getCreditPurchases(userId: string): Promise<CreditPurchase[]> {
    return db.select().from(creditPurchases).where(eq(creditPurchases.userId, userId)).orderBy(desc(creditPurchases.createdAt));
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async getInvoices(userId: string): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.userId, userId)).orderBy(desc(invoices.createdAt));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
    return inv;
  }

  async getAllInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async createCreditUsage(entry: InsertCreditUsageLog): Promise<CreditUsageLog> {
    const [created] = await db.insert(creditUsageLog).values(entry).returning();
    return created;
  }

  async getCreditUsage(userId: string, limit = 50): Promise<CreditUsageLog[]> {
    return db.select().from(creditUsageLog).where(eq(creditUsageLog.userId, userId)).orderBy(desc(creditUsageLog.createdAt)).limit(limit);
  }

  async getCreditUsageSince(userId: string, since: Date): Promise<CreditUsageLog[]> {
    return db.select().from(creditUsageLog).where(
      and(eq(creditUsageLog.userId, userId), gte(creditUsageLog.createdAt, since))
    ).orderBy(desc(creditUsageLog.createdAt));
  }

  async getAllCreditUsage(limit = 100): Promise<CreditUsageLog[]> {
    return db.select().from(creditUsageLog).orderBy(desc(creditUsageLog.createdAt)).limit(limit);
  }

  async createUserAgent(agent: InsertUserAgent): Promise<UserAgent> {
    const [created] = await db.insert(userAgents).values(agent).returning();
    return created;
  }

  async getUserAgent(id: string): Promise<UserAgent | undefined> {
    const [agent] = await db.select().from(userAgents).where(eq(userAgents.id, id));
    return agent;
  }

  async getUserAgentsByOwner(ownerId: string): Promise<UserAgent[]> {
    return db.select().from(userAgents).where(eq(userAgents.ownerId, ownerId)).orderBy(desc(userAgents.createdAt));
  }

  async updateUserAgent(id: string, data: Partial<UserAgent>): Promise<UserAgent> {
    const [updated] = await db.update(userAgents).set({ ...data, updatedAt: new Date() }).where(eq(userAgents.id, id)).returning();
    return updated;
  }

  async deleteUserAgent(id: string): Promise<void> {
    await db.delete(userAgents).where(eq(userAgents.id, id));
  }

  async getPublicAgents(): Promise<UserAgent[]> {
    return db.select().from(userAgents).where(
      and(eq(userAgents.visibility, "public"), eq(userAgents.status, "active"), eq(userAgents.type, "business"))
    ).orderBy(desc(userAgents.rating));
  }

  async getMarketplaceAgents(): Promise<UserAgent[]> {
    return db.select().from(userAgents).where(
      and(eq(userAgents.status, "active"), eq(userAgents.type, "business"), eq(userAgents.marketplaceEnabled, true))
    ).orderBy(desc(userAgents.rating));
  }

  async createAgentKnowledgeSource(source: InsertAgentKnowledgeSource): Promise<AgentKnowledgeSource> {
    const [created] = await db.insert(agentKnowledgeSources).values(source).returning();
    return created;
  }

  async getAgentKnowledgeSources(agentId: string): Promise<AgentKnowledgeSource[]> {
    return db.select().from(agentKnowledgeSources).where(eq(agentKnowledgeSources.agentId, agentId)).orderBy(desc(agentKnowledgeSources.createdAt));
  }
  async getAgentKnowledgeSource(id: string): Promise<AgentKnowledgeSource | undefined> {
    const [source] = await db.select().from(agentKnowledgeSources).where(eq(agentKnowledgeSources.id, id));
    return source;
  }

  async deleteAgentKnowledgeSource(id: string): Promise<void> {
    await db.delete(agentKnowledgeSources).where(eq(agentKnowledgeSources.id, id));
  }

  async createMarketplaceListing(listing: InsertMarketplaceListing): Promise<MarketplaceListing> {
    const [created] = await db.insert(marketplaceListings).values(listing).returning();
    return created;
  }

  async getMarketplaceListing(id: string): Promise<MarketplaceListing | undefined> {
    const [listing] = await db.select().from(marketplaceListings).where(eq(marketplaceListings.id, id));
    return listing;
  }

  async getMarketplaceListings(category?: string): Promise<MarketplaceListing[]> {
    const safeStatuses = ["approved"];
    if (category) {
      return db.select().from(marketplaceListings).where(
        and(inArray(marketplaceListings.status, safeStatuses), eq(marketplaceListings.category, category))
      ).orderBy(desc(marketplaceListings.totalSales));
    }
    return db.select().from(marketplaceListings).where(inArray(marketplaceListings.status, safeStatuses)).orderBy(desc(marketplaceListings.totalSales));
  }

  async getMarketplaceListingByAgent(agentId: string): Promise<MarketplaceListing | undefined> {
    const [listing] = await db.select().from(marketplaceListings).where(eq(marketplaceListings.agentId, agentId));
    return listing;
  }

  async updateMarketplaceListing(id: string, data: Partial<MarketplaceListing>): Promise<MarketplaceListing> {
    const [updated] = await db.update(marketplaceListings).set({ ...data, updatedAt: new Date() }).where(eq(marketplaceListings.id, id)).returning();
    return updated;
  }

  async createAgentMarketplaceClonePackage(data: InsertAgentMarketplaceClonePackage): Promise<AgentMarketplaceClonePackage> {
    const [created] = await db.insert(agentMarketplaceClonePackages).values(data).returning();
    return created;
  }

  async getAgentMarketplaceClonePackage(id: string): Promise<AgentMarketplaceClonePackage | undefined> {
    const [pkg] = await db.select().from(agentMarketplaceClonePackages).where(eq(agentMarketplaceClonePackages.id, id));
    return pkg;
  }

  async getAgentMarketplaceClonePackageByListingId(listingId: string): Promise<AgentMarketplaceClonePackage | undefined> {
    const [pkg] = await db.select().from(agentMarketplaceClonePackages).where(eq(agentMarketplaceClonePackages.marketplaceListingId, listingId));
    return pkg;
  }

  async getAgentMarketplaceClonePackagesByCreator(creatorUserId: string): Promise<AgentMarketplaceClonePackage[]> {
    return db.select().from(agentMarketplaceClonePackages)
      .where(eq(agentMarketplaceClonePackages.creatorUserId, creatorUserId))
      .orderBy(desc(agentMarketplaceClonePackages.createdAt));
  }

  async getAgentMarketplaceClonePackagesForReview(status?: string): Promise<AgentMarketplaceClonePackage[]> {
    if (status) {
      return db.select().from(agentMarketplaceClonePackages)
        .where(eq(agentMarketplaceClonePackages.reviewStatus, status))
        .orderBy(desc(agentMarketplaceClonePackages.createdAt));
    }
    return db.select().from(agentMarketplaceClonePackages).orderBy(desc(agentMarketplaceClonePackages.createdAt));
  }

  async updateAgentMarketplaceClonePackage(id: string, data: Partial<AgentMarketplaceClonePackage>): Promise<AgentMarketplaceClonePackage> {
    const [updated] = await db.update(agentMarketplaceClonePackages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(agentMarketplaceClonePackages.id, id))
      .returning();
    return updated;
  }

  async createAgentPurchase(purchase: InsertAgentPurchase): Promise<AgentPurchase> {
    const [created] = await db.insert(agentPurchases).values(purchase).returning();
    return created;
  }

  async getAgentPurchasesByBuyer(buyerId: string): Promise<AgentPurchase[]> {
    return db.select().from(agentPurchases).where(eq(agentPurchases.buyerId, buyerId)).orderBy(desc(agentPurchases.createdAt));
  }

  async getAgentPurchasesBySeller(sellerId: string): Promise<AgentPurchase[]> {
    return db.select().from(agentPurchases).where(eq(agentPurchases.sellerId, sellerId)).orderBy(desc(agentPurchases.createdAt));
  }

  async hasUserPurchasedAgent(buyerId: string, agentId: string): Promise<boolean> {
    const [purchase] = await db.select().from(agentPurchases).where(
      and(eq(agentPurchases.buyerId, buyerId), eq(agentPurchases.agentId, agentId), eq(agentPurchases.status, "active"))
    );
    return !!purchase;
  }

  async createAgentUsageLog(log: InsertAgentUsageLog): Promise<AgentUsageLog> {
    const [created] = await db.insert(agentUsageLogs).values(log).returning();
    return created;
  }

  async getAgentUsageLogs(agentId: string, limit = 50): Promise<AgentUsageLog[]> {
    return db.select().from(agentUsageLogs).where(eq(agentUsageLogs.agentId, agentId)).orderBy(desc(agentUsageLogs.createdAt)).limit(limit);
  }

  async createAgentReview(review: InsertAgentReview): Promise<AgentReview> {
    const [created] = await db.insert(agentReviews).values(review).returning();
    return created;
  }

  async getAgentReviews(agentId: string): Promise<AgentReview[]> {
    return db.select().from(agentReviews).where(eq(agentReviews.agentId, agentId)).orderBy(desc(agentReviews.createdAt));
  }

  async getReviewsByListing(listingId: string): Promise<AgentReview[]> {
    return db.select().from(agentReviews).where(eq(agentReviews.listingId, listingId)).orderBy(desc(agentReviews.createdAt));
  }

  async createAgentVersion(version: InsertAgentVersion): Promise<AgentVersion> {
    const [created] = await db.insert(agentVersions).values(version).returning();
    return created;
  }

  async getAgentVersions(agentId: string): Promise<AgentVersion[]> {
    return db.select().from(agentVersions).where(eq(agentVersions.agentId, agentId)).orderBy(desc(agentVersions.createdAt));
  }

  async createAgentCostLog(log: InsertAgentCostLog): Promise<AgentCostLog> {
    const [created] = await db.insert(agentCostLogs).values(log).returning();
    return created;
  }

  async getAgentCostLogs(ownerId: string, limit = 50): Promise<AgentCostLog[]> {
    return db.select().from(agentCostLogs).where(eq(agentCostLogs.ownerId, ownerId)).orderBy(desc(agentCostLogs.createdAt)).limit(limit);
  }

  async getAgentCostLogsByAgent(agentId: string, limit = 50): Promise<AgentCostLog[]> {
    return db.select().from(agentCostLogs).where(eq(agentCostLogs.agentId, agentId)).orderBy(desc(agentCostLogs.createdAt)).limit(limit);
  }

  async getStoreRankings(limit = 20): Promise<MarketplaceListing[]> {
    const safeStatuses = ["approved"];
    return db.select().from(marketplaceListings)
      .where(inArray(marketplaceListings.status, safeStatuses))
      .orderBy(sql`(${marketplaceListings.totalSales} * 0.4 + ${marketplaceListings.averageRating} * 20 * 0.3 + ${marketplaceListings.reviewCount} * 0.3) DESC`)
      .limit(limit);
  }

  async getFeaturedListings(): Promise<MarketplaceListing[]> {
    const safeStatuses = ["approved"];
    return db.select().from(marketplaceListings)
      .where(and(inArray(marketplaceListings.status, safeStatuses), eq(marketplaceListings.featured, true)))
      .orderBy(desc(marketplaceListings.totalSales));
  }

  async getTrendingListings(limit = 10): Promise<MarketplaceListing[]> {
    const safeStatuses = ["approved"];
    return db.select().from(marketplaceListings)
      .where(inArray(marketplaceListings.status, safeStatuses))
      .orderBy(desc(marketplaceListings.totalSales))
      .limit(limit);
  }

  async searchListings(query: string, category?: string): Promise<MarketplaceListing[]> {
    const safeStatuses = ["approved"];
    const searchPattern = `%${query.toLowerCase()}%`;
    if (category) {
      return db.select().from(marketplaceListings).where(
        and(
          inArray(marketplaceListings.status, safeStatuses),
          eq(marketplaceListings.category, category),
          sql`(LOWER(${marketplaceListings.title}) LIKE ${searchPattern} OR LOWER(${marketplaceListings.description}) LIKE ${searchPattern})`
        )
      ).orderBy(desc(marketplaceListings.totalSales));
    }
    return db.select().from(marketplaceListings).where(
      and(
        inArray(marketplaceListings.status, safeStatuses),
        sql`(LOWER(${marketplaceListings.title}) LIKE ${searchPattern} OR LOWER(${marketplaceListings.description}) LIKE ${searchPattern})`
      )
    ).orderBy(desc(marketplaceListings.totalSales));
  }
  async createTeam(data: InsertAgentTeam): Promise<AgentTeam> {
    const [team] = await db.insert(agentTeams).values(data).returning();
    return team;
  }
  async getTeam(id: string): Promise<AgentTeam | undefined> {
    const [team] = await db.select().from(agentTeams).where(eq(agentTeams.id, id));
    return team;
  }
  async getTeams(): Promise<AgentTeam[]> {
    return db.select().from(agentTeams).orderBy(desc(agentTeams.createdAt));
  }
  async updateTeam(id: string, data: Partial<AgentTeam>): Promise<AgentTeam> {
    const [updated] = await db.update(agentTeams).set(data).where(eq(agentTeams.id, id)).returning();
    return updated;
  }
  async createTeamMember(data: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values(data).returning();
    return member;
  }
  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    return db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
  }
  async updateTeamMember(id: string, data: Partial<TeamMember>): Promise<TeamMember> {
    const [updated] = await db.update(teamMembers).set(data).where(eq(teamMembers.id, id)).returning();
    return updated;
  }
  async createTeamTask(data: InsertTeamTask): Promise<TeamTask> {
    const [task] = await db.insert(teamTasks).values(data).returning();
    return task;
  }
  async getTeamTasks(teamId: string): Promise<TeamTask[]> {
    return db.select().from(teamTasks).where(eq(teamTasks.teamId, teamId)).orderBy(asc(teamTasks.priority));
  }
  async getTeamTask(id: string): Promise<TeamTask | undefined> {
    const [task] = await db.select().from(teamTasks).where(eq(teamTasks.id, id));
    return task;
  }
  async updateTeamTask(id: string, data: Partial<TeamTask>): Promise<TeamTask> {
    const [updated] = await db.update(teamTasks).set(data).where(eq(teamTasks.id, id)).returning();
    return updated;
  }
  async createTeamMessage(data: InsertTeamMessage): Promise<TeamMessage> {
    const [msg] = await db.insert(teamMessages).values(data).returning();
    return msg;
  }
  async getTeamMessages(teamId: string): Promise<TeamMessage[]> {
    return db.select().from(teamMessages).where(eq(teamMessages.teamId, teamId)).orderBy(asc(teamMessages.createdAt));
  }
  async setWorkspaceEntry(data: InsertTeamWorkspace): Promise<TeamWorkspace> {
    const [entry] = await db.insert(teamWorkspaces).values(data).returning();
    return entry;
  }
  async getWorkspaceEntries(teamId: string): Promise<TeamWorkspace[]> {
    return db.select().from(teamWorkspaces).where(eq(teamWorkspaces.teamId, teamId)).orderBy(asc(teamWorkspaces.updatedAt));
  }

  // Civilization Stability Layer
  async getComputeBudget(agentId: string): Promise<AgentComputeBudget | undefined> {
    const [budget] = await db.select().from(agentComputeBudgets).where(eq(agentComputeBudgets.agentId, agentId));
    return budget;
  }
  async upsertComputeBudget(data: InsertAgentComputeBudget): Promise<AgentComputeBudget> {
    const existing = await this.getComputeBudget(data.agentId);
    if (existing) {
      const [updated] = await db.update(agentComputeBudgets).set(data).where(eq(agentComputeBudgets.agentId, data.agentId)).returning();
      return updated;
    }
    const [created] = await db.insert(agentComputeBudgets).values(data).returning();
    return created;
  }
  async getAllComputeBudgets(): Promise<AgentComputeBudget[]> {
    return db.select().from(agentComputeBudgets);
  }
  async updateComputeBudget(id: string, data: Partial<AgentComputeBudget>): Promise<AgentComputeBudget> {
    const [updated] = await db.update(agentComputeBudgets).set(data).where(eq(agentComputeBudgets.id, id)).returning();
    return updated;
  }
  async resetAllDailyBudgets(): Promise<void> {
    await db.update(agentComputeBudgets).set({ usedToday: 0, throttleLevel: "none", resetAt: new Date() });
  }
  async getVisibilityScore(agentId: string): Promise<AgentVisibilityScore | undefined> {
    const [score] = await db.select().from(agentVisibilityScores).where(eq(agentVisibilityScores.agentId, agentId));
    return score;
  }
  async upsertVisibilityScore(data: InsertAgentVisibilityScore): Promise<AgentVisibilityScore> {
    const existing = await this.getVisibilityScore(data.agentId);
    if (existing) {
      const [updated] = await db.update(agentVisibilityScores).set({ ...data, lastUpdated: new Date() }).where(eq(agentVisibilityScores.agentId, data.agentId)).returning();
      return updated;
    }
    const [created] = await db.insert(agentVisibilityScores).values(data).returning();
    return created;
  }
  async getAllVisibilityScores(): Promise<AgentVisibilityScore[]> {
    return db.select().from(agentVisibilityScores);
  }
  async getPolicyRules(): Promise<PolicyRule[]> {
    return db.select().from(policyRules).orderBy(desc(policyRules.createdAt));
  }
  async createPolicyRule(data: InsertPolicyRule): Promise<PolicyRule> {
    const [rule] = await db.insert(policyRules).values(data).returning();
    return rule;
  }
  async updatePolicyRule(id: string, data: Partial<PolicyRule>): Promise<PolicyRule> {
    const [updated] = await db.update(policyRules).set(data).where(eq(policyRules.id, id)).returning();
    return updated;
  }
  async getPolicyViolations(limit = 100): Promise<PolicyViolation[]> {
    return db.select().from(policyViolations).orderBy(desc(policyViolations.detectedAt)).limit(limit);
  }
  async createPolicyViolation(data: InsertPolicyViolation): Promise<PolicyViolation> {
    const [violation] = await db.insert(policyViolations).values(data).returning();
    return violation;
  }
  async updatePolicyViolation(id: string, data: Partial<PolicyViolation>): Promise<PolicyViolation> {
    const [updated] = await db.update(policyViolations).set(data).where(eq(policyViolations.id, id)).returning();
    return updated;
  }
  async getViolationsByAgent(agentId: string): Promise<PolicyViolation[]> {
    return db.select().from(policyViolations).where(eq(policyViolations.agentId, agentId)).orderBy(desc(policyViolations.detectedAt));
  }
  async createCreditSink(data: InsertCreditSink): Promise<CreditSink> {
    const [sink] = await db.insert(creditSinks).values(data).returning();
    return sink;
  }
  async getCreditSinks(limit = 100): Promise<CreditSink[]> {
    return db.select().from(creditSinks).orderBy(desc(creditSinks.createdAt)).limit(limit);
  }
  async getCreditSinkTotals(): Promise<{ type: string; total: number }[]> {
    const results = await db.select({
      type: creditSinks.type,
      total: sql<number>`sum(${creditSinks.amount})::int`,
    }).from(creditSinks).groupBy(creditSinks.type);
    return results;
  }
  async createHealthSnapshot(data: InsertCivilizationHealthSnapshot): Promise<CivilizationHealthSnapshot> {
    const [snapshot] = await db.insert(civilizationHealthSnapshots).values(data).returning();
    return snapshot;
  }
  async getHealthSnapshots(limit = 50): Promise<CivilizationHealthSnapshot[]> {
    return db.select().from(civilizationHealthSnapshots).orderBy(desc(civilizationHealthSnapshots.createdAt)).limit(limit);
  }
  async getLatestHealthSnapshot(): Promise<CivilizationHealthSnapshot | undefined> {
    const [snapshot] = await db.select().from(civilizationHealthSnapshots).orderBy(desc(civilizationHealthSnapshots.createdAt)).limit(1);
    return snapshot;
  }

  async createPlatformEvent(data: InsertPlatformEvent): Promise<PlatformEvent> {
    const [event] = await db.insert(platformEvents).values(data).returning();
    return event;
  }
  async getPlatformEvents(limit = 100): Promise<PlatformEvent[]> {
    return db.select().from(platformEvents).orderBy(desc(platformEvents.createdAt)).limit(limit);
  }
  async getPlatformEventsByType(eventType: string, limit = 50): Promise<PlatformEvent[]> {
    return db.select().from(platformEvents).where(eq(platformEvents.eventType, eventType)).orderBy(desc(platformEvents.createdAt)).limit(limit);
  }
  async getPlatformEventsSince(since: Date): Promise<PlatformEvent[]> {
    return db.select().from(platformEvents).where(gte(platformEvents.createdAt, since)).orderBy(desc(platformEvents.createdAt));
  }
  async getPlatformEventCounts(): Promise<{ eventType: string; count: number }[]> {
    const results = await db.select({
      eventType: platformEvents.eventType,
      count: sql<number>`count(*)::int`,
    }).from(platformEvents).groupBy(platformEvents.eventType);
    return results;
  }

  async createAgentPassport(data: InsertAgentPassport): Promise<AgentPassport> {
    const [passport] = await db.insert(agentPassports).values(data).returning();
    return passport;
  }

  async getAgentPassportsByOwner(ownerId: string): Promise<AgentPassport[]> {
    return db.select().from(agentPassports).where(eq(agentPassports.ownerId, ownerId)).orderBy(desc(agentPassports.createdAt));
  }

  async revokeAgentPassport(id: string, ownerId: string): Promise<AgentPassport | undefined> {
    const [revoked] = await db.update(agentPassports)
      .set({ revokedAt: new Date() })
      .where(and(eq(agentPassports.id, id), eq(agentPassports.ownerId, ownerId)))
      .returning();
    return revoked;
  }

  async getAgentPassportByHash(hash: string): Promise<AgentPassport | undefined> {
    const [passport] = await db.select().from(agentPassports).where(eq(agentPassports.passportHash, hash));
    return passport;
  }

  async createAgentPassportExport(data: InsertAgentPassportExport): Promise<AgentPassportExport> {
    const [exported] = await db.insert(agentPassportExports).values(data).returning();
    return exported;
  }

  async getAgentPassportExportsByOwner(ownerId: string): Promise<AgentPassportExport[]> {
    return db.select().from(agentPassportExports).where(eq(agentPassportExports.ownerId, ownerId)).orderBy(desc(agentPassportExports.createdAt));
  }

  async revokeAgentPassportExport(id: string, ownerId: string, reason?: string | null): Promise<AgentPassportExport | undefined> {
    const [revoked] = await db.update(agentPassportExports)
      .set({ revoked: true, revokedAt: new Date(), revocationReason: reason || null })
      .where(and(eq(agentPassportExports.id, id), eq(agentPassportExports.ownerId, ownerId)))
      .returning();
    return revoked;
  }

  async getAgentPassportExportByHash(hash: string): Promise<AgentPassportExport | undefined> {
    const [exported] = await db.select().from(agentPassportExports).where(eq(agentPassportExports.exportHash, hash));
    return exported;
  }

  async getAgentPassportExportById(id: string): Promise<AgentPassportExport | undefined> {
    const [exported] = await db.select().from(agentPassportExports).where(eq(agentPassportExports.id, id));
    return exported;
  }

  async createFlywheelAgent(data: InsertFlywheelAgent): Promise<FlywheelAgent> {
    const [agent] = await db.insert(flywheelAgents).values(data).returning();
    return agent;
  }
  async getFlywheelAgents(): Promise<FlywheelAgent[]> {
    return db.select().from(flywheelAgents).orderBy(asc(flywheelAgents.agentType));
  }
  async getFlywheelAgentByType(agentType: string): Promise<FlywheelAgent | undefined> {
    const [agent] = await db.select().from(flywheelAgents).where(eq(flywheelAgents.agentType, agentType));
    return agent;
  }
  async updateFlywheelAgent(id: string, data: Partial<FlywheelAgent>): Promise<FlywheelAgent> {
    const [updated] = await db.update(flywheelAgents).set(data).where(eq(flywheelAgents.id, id)).returning();
    return updated;
  }

  async createFlywheelRecommendation(data: InsertFlywheelRecommendation): Promise<FlywheelRecommendation> {
    const [rec] = await db.insert(flywheelRecommendations).values(data).returning();
    return rec;
  }
  async getFlywheelRecommendations(status?: string): Promise<FlywheelRecommendation[]> {
    if (status) {
      return db.select().from(flywheelRecommendations).where(eq(flywheelRecommendations.status, status)).orderBy(desc(flywheelRecommendations.createdAt));
    }
    return db.select().from(flywheelRecommendations).orderBy(desc(flywheelRecommendations.createdAt)).limit(100);
  }
  async updateFlywheelRecommendation(id: string, data: Partial<FlywheelRecommendation>): Promise<FlywheelRecommendation> {
    const [updated] = await db.update(flywheelRecommendations).set(data).where(eq(flywheelRecommendations.id, id)).returning();
    return updated;
  }

  async getFlywheelAutomationConfig(): Promise<FlywheelAutomationConfig | undefined> {
    const [config] = await db.select().from(flywheelAutomationConfig).limit(1);
    return config;
  }
  async upsertFlywheelAutomationConfig(data: Partial<FlywheelAutomationConfig>): Promise<FlywheelAutomationConfig> {
    const existing = await this.getFlywheelAutomationConfig();
    if (existing) {
      const [updated] = await db.update(flywheelAutomationConfig).set({ ...data, lastUpdated: new Date() }).where(eq(flywheelAutomationConfig.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(flywheelAutomationConfig).values({ mode: data.mode || "manual", safeActions: data.safeActions || [], thresholds: data.thresholds || {} }).returning();
    return created;
  }

  async createFlywheelOutcome(data: InsertFlywheelOptimizationOutcome): Promise<FlywheelOptimizationOutcome> {
    const [outcome] = await db.insert(flywheelOptimizationOutcomes).values(data).returning();
    return outcome;
  }
  async getFlywheelOutcomes(limit = 50): Promise<FlywheelOptimizationOutcome[]> {
    return db.select().from(flywheelOptimizationOutcomes).orderBy(desc(flywheelOptimizationOutcomes.createdAt)).limit(limit);
  }

  // ============ Personal AI Agent ============

  async getPersonalAgentProfile(userId: string): Promise<PersonalAgentProfile | undefined> {
    const [profile] = await db.select().from(personalAgentProfiles).where(eq(personalAgentProfiles.userId, userId));
    return profile;
  }
  async createPersonalAgentProfile(data: InsertPersonalAgentProfile): Promise<PersonalAgentProfile> {
    const [profile] = await db.insert(personalAgentProfiles).values(data).returning();
    return profile;
  }
  async updatePersonalAgentProfile(userId: string, data: Partial<PersonalAgentProfile>): Promise<PersonalAgentProfile> {
    const [updated] = await db.update(personalAgentProfiles).set(data).where(eq(personalAgentProfiles.userId, userId)).returning();
    return updated;
  }
  async deletePersonalAgentProfile(userId: string): Promise<void> {
    await db.delete(personalAgentProfiles).where(eq(personalAgentProfiles.userId, userId));
  }

  async getPersonalAgentMemories(userId: string, domain?: string): Promise<PersonalAgentMemory[]> {
    if (domain) {
      return db.select().from(personalAgentMemories).where(and(eq(personalAgentMemories.userId, userId), eq(personalAgentMemories.domain, domain))).orderBy(desc(personalAgentMemories.createdAt));
    }
    return db.select().from(personalAgentMemories).where(eq(personalAgentMemories.userId, userId)).orderBy(desc(personalAgentMemories.createdAt));
  }
  async getConfirmedMemories(userId: string, domain?: string): Promise<PersonalAgentMemory[]> {
    if (domain) {
      return db.select().from(personalAgentMemories).where(and(eq(personalAgentMemories.userId, userId), eq(personalAgentMemories.domain, domain), eq(personalAgentMemories.confirmed, true))).orderBy(desc(personalAgentMemories.importance));
    }
    return db.select().from(personalAgentMemories).where(and(eq(personalAgentMemories.userId, userId), eq(personalAgentMemories.confirmed, true))).orderBy(desc(personalAgentMemories.importance));
  }
  async createPersonalAgentMemory(data: InsertPersonalAgentMemory): Promise<PersonalAgentMemory> {
    const [memory] = await db.insert(personalAgentMemories).values(data).returning();
    return memory;
  }
  async updatePersonalAgentMemory(id: string, data: Partial<PersonalAgentMemory>): Promise<PersonalAgentMemory> {
    const [updated] = await db.update(personalAgentMemories).set(data).where(eq(personalAgentMemories.id, id)).returning();
    return updated;
  }
  async deletePersonalAgentMemory(id: string): Promise<void> {
    await db.delete(personalAgentMemories).where(eq(personalAgentMemories.id, id));
  }
  async deleteAllPersonalAgentMemories(userId: string): Promise<void> {
    await db.delete(personalAgentMemories).where(eq(personalAgentMemories.userId, userId));
  }

  async getPersonalAgentConversations(userId: string): Promise<PersonalAgentConversation[]> {
    return db.select().from(personalAgentConversations).where(eq(personalAgentConversations.userId, userId)).orderBy(desc(personalAgentConversations.createdAt));
  }
  async createPersonalAgentConversation(data: InsertPersonalAgentConversation): Promise<PersonalAgentConversation> {
    const [conv] = await db.insert(personalAgentConversations).values(data).returning();
    return conv;
  }
  async deletePersonalAgentConversation(id: string): Promise<void> {
    await db.delete(personalAgentMessages).where(eq(personalAgentMessages.conversationId, id));
    await db.delete(personalAgentConversations).where(eq(personalAgentConversations.id, id));
  }
  async deleteAllPersonalAgentConversations(userId: string): Promise<void> {
    const convs = await this.getPersonalAgentConversations(userId);
    for (const c of convs) {
      await db.delete(personalAgentMessages).where(eq(personalAgentMessages.conversationId, c.id));
    }
    await db.delete(personalAgentConversations).where(eq(personalAgentConversations.userId, userId));
  }

  async getPersonalAgentMessages(conversationId: string): Promise<PersonalAgentMessage[]> {
    return db.select().from(personalAgentMessages).where(eq(personalAgentMessages.conversationId, conversationId)).orderBy(asc(personalAgentMessages.createdAt));
  }
  async createPersonalAgentMessage(data: InsertPersonalAgentMessage): Promise<PersonalAgentMessage> {
    const [msg] = await db.insert(personalAgentMessages).values(data).returning();
    return msg;
  }

  async getPersonalAgentTasks(userId: string, status?: string): Promise<PersonalAgentTask[]> {
    if (status) {
      return db.select().from(personalAgentTasks).where(and(eq(personalAgentTasks.userId, userId), eq(personalAgentTasks.status, status))).orderBy(desc(personalAgentTasks.createdAt));
    }
    return db.select().from(personalAgentTasks).where(eq(personalAgentTasks.userId, userId)).orderBy(desc(personalAgentTasks.createdAt));
  }
  async createPersonalAgentTask(data: InsertPersonalAgentTask): Promise<PersonalAgentTask> {
    const [task] = await db.insert(personalAgentTasks).values(data).returning();
    return task;
  }
  async updatePersonalAgentTask(id: string, data: Partial<PersonalAgentTask>): Promise<PersonalAgentTask> {
    const [updated] = await db.update(personalAgentTasks).set(data).where(eq(personalAgentTasks.id, id)).returning();
    return updated;
  }
  async deletePersonalAgentTask(id: string): Promise<void> {
    await db.delete(personalAgentTasks).where(eq(personalAgentTasks.id, id));
  }
  async deleteAllPersonalAgentTasks(userId: string): Promise<void> {
    await db.delete(personalAgentTasks).where(eq(personalAgentTasks.userId, userId));
  }

  async getPersonalAgentDevices(userId: string): Promise<PersonalAgentDevice[]> {
    return db.select().from(personalAgentDevices).where(eq(personalAgentDevices.userId, userId)).orderBy(desc(personalAgentDevices.createdAt));
  }
  async createPersonalAgentDevice(data: InsertPersonalAgentDevice): Promise<PersonalAgentDevice> {
    const [device] = await db.insert(personalAgentDevices).values(data).returning();
    return device;
  }
  async updatePersonalAgentDevice(id: string, data: Partial<PersonalAgentDevice>): Promise<PersonalAgentDevice> {
    const [updated] = await db.update(personalAgentDevices).set(data).where(eq(personalAgentDevices.id, id)).returning();
    return updated;
  }
  async deletePersonalAgentDevice(id: string): Promise<void> {
    await db.delete(personalAgentDevices).where(eq(personalAgentDevices.id, id));
  }
  async deleteAllPersonalAgentDevices(userId: string): Promise<void> {
    await db.delete(personalAgentDevices).where(eq(personalAgentDevices.userId, userId));
  }

  async getPersonalAgentFinance(userId: string): Promise<PersonalAgentFinanceEntry[]> {
    return db.select().from(personalAgentFinance).where(eq(personalAgentFinance.userId, userId)).orderBy(desc(personalAgentFinance.createdAt));
  }
  async createPersonalAgentFinance(data: InsertPersonalAgentFinanceEntry): Promise<PersonalAgentFinanceEntry> {
    const [entry] = await db.insert(personalAgentFinance).values(data).returning();
    return entry;
  }
  async updatePersonalAgentFinance(id: string, data: Partial<PersonalAgentFinanceEntry>): Promise<PersonalAgentFinanceEntry> {
    const [updated] = await db.update(personalAgentFinance).set(data).where(eq(personalAgentFinance.id, id)).returning();
    return updated;
  }
  async deletePersonalAgentFinance(id: string): Promise<void> {
    await db.delete(personalAgentFinance).where(eq(personalAgentFinance.id, id));
  }
  async deleteAllPersonalAgentFinance(userId: string): Promise<void> {
    await db.delete(personalAgentFinance).where(eq(personalAgentFinance.userId, userId));
  }

  async getPersonalAgentUsage(userId: string, dateKey: string): Promise<PersonalAgentUsage[]> {
    return db.select().from(personalAgentUsage).where(and(eq(personalAgentUsage.userId, userId), eq(personalAgentUsage.dateKey, dateKey)));
  }
  async createPersonalAgentUsage(data: InsertPersonalAgentUsage): Promise<PersonalAgentUsage> {
    const [usage] = await db.insert(personalAgentUsage).values(data).returning();
    return usage;
  }
  async deleteAllPersonalAgentData(userId: string): Promise<void> {
    await this.deleteAllPersonalAgentConversations(userId);
    await this.deleteAllPersonalAgentMemories(userId);
    await this.deleteAllPersonalAgentTasks(userId);
    await this.deleteAllPersonalAgentDevices(userId);
    await this.deleteAllPersonalAgentFinance(userId);
    await db.delete(personalAgentUsage).where(eq(personalAgentUsage.userId, userId));
    await this.deletePersonalAgentProfile(userId);
  }

  // Privacy Framework
  async createPrivacyVault(data: InsertAgentPrivacyVault): Promise<AgentPrivacyVault> {
    const [vault] = await db.insert(agentPrivacyVaults).values(data).returning();
    return vault;
  }
  async getPrivacyVault(id: string): Promise<AgentPrivacyVault | undefined> {
    const [vault] = await db.select().from(agentPrivacyVaults).where(eq(agentPrivacyVaults.id, id));
    return vault;
  }
  async getPrivacyVaultByAgent(agentId: string): Promise<AgentPrivacyVault | undefined> {
    const [vault] = await db.select().from(agentPrivacyVaults).where(eq(agentPrivacyVaults.agentId, agentId));
    return vault;
  }
  async getPrivacyVaultsByOwner(ownerId: string): Promise<AgentPrivacyVault[]> {
    return db.select().from(agentPrivacyVaults).where(eq(agentPrivacyVaults.ownerId, ownerId)).orderBy(desc(agentPrivacyVaults.createdAt));
  }
  async updatePrivacyVault(id: string, data: Partial<AgentPrivacyVault>): Promise<AgentPrivacyVault> {
    const [updated] = await db.update(agentPrivacyVaults).set({ ...data, updatedAt: new Date() }).where(eq(agentPrivacyVaults.id, id)).returning();
    return updated;
  }
  async deletePrivacyVault(id: string): Promise<void> {
    await db.delete(agentPrivacyVaults).where(eq(agentPrivacyVaults.id, id));
  }

  async createPrivacyAccessLog(data: InsertPrivacyAccessLog): Promise<PrivacyAccessLog> {
    const [log] = await db.insert(privacyAccessLogs).values(data).returning();
    return log;
  }
  async getPrivacyAccessLogs(vaultId: string, limit = 100): Promise<PrivacyAccessLog[]> {
    return db.select().from(privacyAccessLogs).where(eq(privacyAccessLogs.vaultId, vaultId)).orderBy(desc(privacyAccessLogs.createdAt)).limit(limit);
  }
  async getPrivacyAccessLogsByOwner(ownerId: string, limit = 100): Promise<PrivacyAccessLog[]> {
    const vaults = await this.getPrivacyVaultsByOwner(ownerId);
    const vaultIds = vaults.map(v => v.id);
    if (vaultIds.length === 0) return [];
    const { inArray } = await import("drizzle-orm");
    return db.select().from(privacyAccessLogs).where(inArray(privacyAccessLogs.vaultId, vaultIds)).orderBy(desc(privacyAccessLogs.createdAt)).limit(limit);
  }

  async createPrivacyViolation(data: InsertPrivacyViolation): Promise<PrivacyViolation> {
    const [violation] = await db.insert(privacyViolations).values(data).returning();
    return violation;
  }
  async getPrivacyViolations(vaultId?: string, limit = 50): Promise<PrivacyViolation[]> {
    if (vaultId) {
      return db.select().from(privacyViolations).where(eq(privacyViolations.vaultId, vaultId)).orderBy(desc(privacyViolations.createdAt)).limit(limit);
    }
    return db.select().from(privacyViolations).orderBy(desc(privacyViolations.createdAt)).limit(limit);
  }
  async getUnresolvedViolations(): Promise<PrivacyViolation[]> {
    return db.select().from(privacyViolations).where(eq(privacyViolations.resolved, false)).orderBy(desc(privacyViolations.createdAt));
  }
  async resolvePrivacyViolation(id: string, actionTaken: string): Promise<PrivacyViolation> {
    const [resolved] = await db.update(privacyViolations).set({ resolved: true, actionTaken, resolvedAt: new Date() }).where(eq(privacyViolations.id, id)).returning();
    return resolved;
  }

  async createPrivacyGatewayRule(data: InsertPrivacyGatewayRule): Promise<PrivacyGatewayRule> {
    const [rule] = await db.insert(privacyGatewayRules).values(data).returning();
    return rule;
  }
  async getPrivacyGatewayRules(): Promise<PrivacyGatewayRule[]> {
    return db.select().from(privacyGatewayRules).where(eq(privacyGatewayRules.isActive, true)).orderBy(desc(privacyGatewayRules.priority));
  }
  async updatePrivacyGatewayRule(id: string, data: Partial<PrivacyGatewayRule>): Promise<PrivacyGatewayRule> {
    const [updated] = await db.update(privacyGatewayRules).set(data).where(eq(privacyGatewayRules.id, id)).returning();
    return updated;
  }
  async deletePrivacyGatewayRule(id: string): Promise<void> {
    await db.delete(privacyGatewayRules).where(eq(privacyGatewayRules.id, id));
  }

  // Trust Moat Framework
  async createUserTrustVault(data: InsertUserTrustVault): Promise<UserTrustVault> {
    const [vault] = await db.insert(userTrustVaults).values(data).returning();
    return vault;
  }
  async getUserTrustVault(id: string): Promise<UserTrustVault | undefined> {
    const [vault] = await db.select().from(userTrustVaults).where(eq(userTrustVaults.id, id));
    return vault;
  }
  async getUserTrustVaultByUserId(userId: string): Promise<UserTrustVault | undefined> {
    const [vault] = await db.select().from(userTrustVaults).where(eq(userTrustVaults.userId, userId));
    return vault;
  }
  async updateUserTrustVault(id: string, data: Partial<UserTrustVault>): Promise<UserTrustVault> {
    const [updated] = await db.update(userTrustVaults).set({ ...data, updatedAt: new Date() }).where(eq(userTrustVaults.id, id)).returning();
    return updated;
  }
  async deleteUserTrustVault(id: string): Promise<void> {
    await db.delete(userTrustVaults).where(eq(userTrustVaults.id, id));
  }
  async getAllUserTrustVaults(): Promise<UserTrustVault[]> {
    return db.select().from(userTrustVaults).orderBy(desc(userTrustVaults.createdAt));
  }

  async createTrustPermissionToken(data: InsertTrustPermissionToken): Promise<TrustPermissionToken> {
    const [token] = await db.insert(trustPermissionTokens).values(data).returning();
    return token;
  }
  async getTrustPermissionToken(id: string): Promise<TrustPermissionToken | undefined> {
    const [token] = await db.select().from(trustPermissionTokens).where(eq(trustPermissionTokens.id, id));
    return token;
  }
  async getTrustPermissionTokensByVault(vaultId: string): Promise<TrustPermissionToken[]> {
    return db.select().from(trustPermissionTokens).where(eq(trustPermissionTokens.vaultId, vaultId)).orderBy(desc(trustPermissionTokens.createdAt));
  }
  async getTrustPermissionTokensByGrantee(grantedTo: string): Promise<TrustPermissionToken[]> {
    return db.select().from(trustPermissionTokens).where(and(eq(trustPermissionTokens.grantedTo, grantedTo), eq(trustPermissionTokens.isRevoked, false))).orderBy(desc(trustPermissionTokens.createdAt));
  }
  async revokeTrustPermissionToken(id: string): Promise<TrustPermissionToken> {
    const [revoked] = await db.update(trustPermissionTokens).set({ isRevoked: true, revokedAt: new Date() }).where(eq(trustPermissionTokens.id, id)).returning();
    return revoked;
  }
  async incrementTokenAccessCount(id: string): Promise<void> {
    await db.update(trustPermissionTokens).set({ accessCount: sql`${trustPermissionTokens.accessCount} + 1` }).where(eq(trustPermissionTokens.id, id));
  }

  async createTrustAccessEvent(data: InsertTrustAccessEvent): Promise<TrustAccessEvent> {
    const [event] = await db.insert(trustAccessEvents).values(data).returning();
    return event;
  }
  async getTrustAccessEventsByVault(vaultId: string, limit = 100): Promise<TrustAccessEvent[]> {
    return db.select().from(trustAccessEvents).where(eq(trustAccessEvents.vaultId, vaultId)).orderBy(desc(trustAccessEvents.createdAt)).limit(limit);
  }
  async getTrustAccessEventsByUser(userId: string, limit = 100): Promise<TrustAccessEvent[]> {
    return db.select().from(trustAccessEvents).where(eq(trustAccessEvents.userId, userId)).orderBy(desc(trustAccessEvents.createdAt)).limit(limit);
  }
  async getTrustAccessEventsCount(vaultId: string): Promise<{ total: number; denied: number }> {
    const [result] = await db.select({
      total: sql<number>`count(*)::int`,
      denied: sql<number>`count(*) filter (where not ${trustAccessEvents.granted})::int`,
    }).from(trustAccessEvents).where(eq(trustAccessEvents.vaultId, vaultId));
    return result || { total: 0, denied: 0 };
  }

  async createTrustHealthMetric(data: InsertTrustHealthMetric): Promise<TrustHealthMetric> {
    const [metric] = await db.insert(trustHealthMetrics).values(data).returning();
    return metric;
  }
  async getLatestTrustHealthMetrics(limit = 30): Promise<TrustHealthMetric[]> {
    return db.select().from(trustHealthMetrics).orderBy(desc(trustHealthMetrics.metricDate)).limit(limit);
  }

  // Projects & Pipeline
  async createProject(data: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(data).returning();
    return created;
  }
  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }
  async getProjects(limit = 50): Promise<Project[]> {
    return db.select().from(projects).orderBy(desc(projects.createdAt)).limit(limit);
  }
  async getProjectByDebateId(debateId: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.debateId, debateId));
    return project;
  }
  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    const [updated] = await db.update(projects).set({ ...data, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    return updated;
  }
  async createProjectPackage(data: InsertProjectPackage): Promise<ProjectPackage> {
    const [created] = await db.insert(projectPackages).values(data).returning();
    return created;
  }
  async getProjectPackages(projectId: string): Promise<ProjectPackage[]> {
    return db.select().from(projectPackages).where(eq(projectPackages.projectId, projectId)).orderBy(desc(projectPackages.generatedAt));
  }
  async getProjectPackage(id: string): Promise<ProjectPackage | undefined> {
    const [pkg] = await db.select().from(projectPackages).where(eq(projectPackages.id, id));
    return pkg;
  }
  async createProjectAgentContribution(data: InsertProjectAgentContribution): Promise<ProjectAgentContribution> {
    const [created] = await db.insert(projectAgentContributions).values(data).returning();
    return created;
  }
  async getProjectAgentContributions(projectId: string): Promise<ProjectAgentContribution[]> {
    return db.select().from(projectAgentContributions).where(eq(projectAgentContributions.projectId, projectId)).orderBy(desc(projectAgentContributions.createdAt));
  }
  async createProjectPackagePurchase(data: InsertProjectPackagePurchase): Promise<ProjectPackagePurchase> {
    const [purchase] = await db.insert(projectPackagePurchases).values(data).returning();
    return purchase;
  }
  async hasProjectPackagePurchase(projectPackageId: string, buyerId: string): Promise<boolean> {
    const [existing] = await db.select().from(projectPackagePurchases)
      .where(and(eq(projectPackagePurchases.projectPackageId, projectPackageId), eq(projectPackagePurchases.buyerId, buyerId)))
      .limit(1);
    return !!existing;
  }
  async createProjectValidation(data: InsertProjectValidation): Promise<ProjectValidation> {
    const [created] = await db.insert(projectValidations).values(data).returning();
    return created;
  }
  async getProjectValidation(id: string): Promise<ProjectValidation | undefined> {
    const [validation] = await db.select().from(projectValidations).where(eq(projectValidations.id, id));
    return validation;
  }
  async getLatestProjectValidationForPackage(projectPackageId: string): Promise<ProjectValidation | undefined> {
    const [validation] = await db.select().from(projectValidations)
      .where(eq(projectValidations.projectPackageId, projectPackageId))
      .orderBy(desc(projectValidations.createdAt))
      .limit(1);
    return validation;
  }
  async createProjectFeedback(data: InsertProjectFeedback): Promise<ProjectFeedback> {
    const [created] = await db.insert(projectFeedback).values(data).returning();
    return created;
  }
  async getProjectFeedback(projectPackageId: string): Promise<ProjectFeedback[]> {
    return db.select().from(projectFeedback).where(eq(projectFeedback.projectPackageId, projectPackageId)).orderBy(desc(projectFeedback.createdAt));
  }

  async listAdminFilterViews(ownerId: string, scope: string): Promise<AdminFilterView[]> {
    return db
      .select()
      .from(adminFilterViews)
      .where(and(eq(adminFilterViews.ownerId, ownerId), eq(adminFilterViews.scope, scope)))
      .orderBy(asc(adminFilterViews.createdAt));
  }

  async getAdminFilterView(id: string, ownerId: string): Promise<AdminFilterView | undefined> {
    const [row] = await db
      .select()
      .from(adminFilterViews)
      .where(and(eq(adminFilterViews.id, id), eq(adminFilterViews.ownerId, ownerId)))
      .limit(1);
    return row;
  }

  async createAdminFilterView(data: InsertAdminFilterView): Promise<AdminFilterView> {
    const [created] = await db.insert(adminFilterViews).values(data).returning();
    return created;
  }

  async updateAdminFilterView(
    id: string,
    ownerId: string,
    data: Partial<Pick<AdminFilterView, "name" | "payload">>,
  ): Promise<AdminFilterView | undefined> {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.payload !== undefined) patch.payload = data.payload;
    const [updated] = await db
      .update(adminFilterViews)
      .set(patch)
      .where(and(eq(adminFilterViews.id, id), eq(adminFilterViews.ownerId, ownerId)))
      .returning();
    return updated;
  }

  async deleteAdminFilterView(id: string, ownerId: string): Promise<boolean> {
    const deleted = await db
      .delete(adminFilterViews)
      .where(and(eq(adminFilterViews.id, id), eq(adminFilterViews.ownerId, ownerId)))
      .returning({ id: adminFilterViews.id });
    return deleted.length > 0;
  }

  // ------------------------------------------------------------------ //
  // R5F — Production Assets storage layer                              //
  // Admin-only 3D-asset catalog. Every mutation writes the row + a     //
  // matching production_asset_audit_log entry atomically inside a      //
  // single db.transaction. No method exposes a setter for publicUrl;   //
  // the column is never written from this layer.                       //
  // ------------------------------------------------------------------ //

  async createAsset(
    input: InsertProductionAsset,
    audit: { actorUserId: string; event?: "uploaded" | "imported"; payload?: unknown },
  ): Promise<ProductionAsset> {
    const parsed = insertProductionAssetSchema.safeParse(input);
    if (!parsed.success) {
      throw new ProductionAssetStorageError(
        "asset_invalid_input",
        `Invalid production asset input: ${parsed.error.message}`,
      );
    }
    const safeValues = {
      ...parsed.data,
      status: parsed.data.status ?? "draft",
      lifecycleState: parsed.data.lifecycleState ?? "uploaded",
      licenseStatus: parsed.data.licenseStatus ?? "unknown",
      safetyReview: parsed.data.safetyReview ?? "pending",
      approvalGate: parsed.data.approvalGate ?? "not_approved",
    };
    if (safeValues.approvalGate !== "not_approved") {
      throw new ProductionAssetStorageError(
        "asset_invalid_input",
        "New assets must be created with approvalGate='not_approved'.",
      );
    }
    const parsedAudit = parseR5F(createAssetAuditInputSchema, audit, "createAsset audit");
    const event = parsedAudit.event ?? "uploaded";
    try {
      return await db.transaction(async (tx) => {
        const [created] = await tx.insert(productionAssets).values(safeValues).returning();
        await tx.insert(productionAssetAuditLog).values({
          assetId: created.id,
          actorUserId: parsedAudit.actorUserId,
          event,
          payload: (parsedAudit.payload ?? null) as any,
        });
        return created;
      });
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      const constraint = String(err?.constraint ?? "");
      const isSha256Conflict =
        err?.code === "23505" &&
        (constraint.includes("sha256") || /sha256/i.test(msg));
      if (isSha256Conflict) {
        throw new ProductionAssetStorageError(
          "asset_sha256_conflict",
          `An asset with sha256=${safeValues.sha256} already exists.`,
        );
      }
      throw err;
    }
  }

  async getAssetById(id: string): Promise<ProductionAsset | undefined> {
    const [row] = await db.select().from(productionAssets).where(eq(productionAssets.id, id)).limit(1);
    return row;
  }

  async getAssetBySha256(sha256: string): Promise<ProductionAsset | undefined> {
    const [row] = await db.select().from(productionAssets).where(eq(productionAssets.sha256, sha256)).limit(1);
    return row;
  }

  async listAssets(opts: {
    status?: string;
    safetyReview?: string;
    approvalGate?: string;
    assetKind?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: ProductionAsset[]; total: number }> {
    const conds: any[] = [];
    if (opts.status) conds.push(eq(productionAssets.status, opts.status));
    if (opts.safetyReview) conds.push(eq(productionAssets.safetyReview, opts.safetyReview));
    if (opts.approvalGate) conds.push(eq(productionAssets.approvalGate, opts.approvalGate));
    if (opts.assetKind) {
      conds.push(sql`${productionAssets.metadata}->>'assetKind' = ${opts.assetKind}`);
    }
    const whereClause = conds.length ? and(...conds) : undefined;

    const itemsQuery = db.select().from(productionAssets);
    const items = await (whereClause ? itemsQuery.where(whereClause) : itemsQuery)
      .orderBy(desc(productionAssets.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    const countQuery = db.select({ count: sql<number>`count(*)::int` }).from(productionAssets);
    const [{ count }] = await (whereClause ? countQuery.where(whereClause) : countQuery);
    return { items, total: Number(count) };
  }

  async updateAssetLicense(
    id: string,
    input: { licenseStatus: string; licenseSource?: string | null; licenseNote?: string | null; actorUserId: string },
  ): Promise<ProductionAsset> {
    const data = parseR5F(updateAssetLicenseInputSchema, input, "updateAssetLicense input");
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(productionAssets).where(eq(productionAssets.id, id)).limit(1);
      if (!existing) {
        throw new ProductionAssetStorageError("asset_not_found", `Asset ${id} not found.`);
      }
      const [updated] = await tx
        .update(productionAssets)
        .set({
          licenseStatus: data.licenseStatus,
          licenseSource: data.licenseSource ?? null,
          licenseNote: data.licenseNote ?? null,
          lifecycleState:
            data.licenseStatus === "unlicensed_rejected" ? "rejected" : "license_reviewed",
          updatedAt: new Date(),
        })
        .where(eq(productionAssets.id, id))
        .returning();
      await tx.insert(productionAssetAuditLog).values({
        assetId: id,
        actorUserId: data.actorUserId,
        event: "license_set",
        payload: {
          licenseStatus: data.licenseStatus,
          licenseSource: data.licenseSource ?? null,
          licenseNote: data.licenseNote ?? null,
        } as any,
      });
      return updated;
    });
  }

  async updateAssetSafetyReview(
    id: string,
    input: { safetyReview: string; safetyNote?: string | null; actorUserId: string },
  ): Promise<ProductionAsset> {
    const data = parseR5F(updateAssetSafetyReviewInputSchema, input, "updateAssetSafetyReview input");
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(productionAssets).where(eq(productionAssets.id, id)).limit(1);
      if (!existing) {
        throw new ProductionAssetStorageError("asset_not_found", `Asset ${id} not found.`);
      }
      const [updated] = await tx
        .update(productionAssets)
        .set({
          safetyReview: data.safetyReview,
          safetyNote: data.safetyNote ?? null,
          lifecycleState:
            data.safetyReview === "rejected" ? "rejected" : "safety_reviewed",
          updatedAt: new Date(),
        })
        .where(eq(productionAssets.id, id))
        .returning();
      await tx.insert(productionAssetAuditLog).values({
        assetId: id,
        actorUserId: data.actorUserId,
        event: "safety_decided",
        payload: {
          safetyReview: data.safetyReview,
          safetyNote: data.safetyNote ?? null,
        } as any,
      });
      return updated;
    });
  }

  async advanceAssetApprovalGate(
    id: string,
    input: { actorUserId: string },
  ): Promise<ProductionAsset> {
    const data = parseR5F(advanceAssetApprovalGateInputSchema, input, "advanceAssetApprovalGate input");
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(productionAssets).where(eq(productionAssets.id, id)).limit(1);
      if (!existing) {
        throw new ProductionAssetStorageError("asset_not_found", `Asset ${id} not found.`);
      }
      if (existing.approvalGate !== "not_approved") {
        throw new ProductionAssetStorageError(
          "asset_invalid_approval_transition",
          `Asset ${id} approvalGate is '${existing.approvalGate}'; only 'not_approved → approved_internal' is allowed.`,
        );
      }
      const [updated] = await tx
        .update(productionAssets)
        .set({
          approvalGate: "approved_internal",
          lifecycleState: "approved_internal",
          updatedAt: new Date(),
        })
        .where(eq(productionAssets.id, id))
        .returning();
      await tx.insert(productionAssetAuditLog).values({
        assetId: id,
        actorUserId: data.actorUserId,
        event: "approval_advanced",
        payload: { from: "not_approved", to: "approved_internal" } as any,
      });
      return updated;
    });
  }

  async archiveAsset(
    id: string,
    input: { actorUserId: string; reason?: string },
  ): Promise<ProductionAsset> {
    const data = parseR5F(archiveAssetInputSchema, input, "archiveAsset input");
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(productionAssets).where(eq(productionAssets.id, id)).limit(1);
      if (!existing) {
        throw new ProductionAssetStorageError("asset_not_found", `Asset ${id} not found.`);
      }
      const [updated] = await tx
        .update(productionAssets)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(productionAssets.id, id))
        .returning();
      await tx.insert(productionAssetAuditLog).values({
        assetId: id,
        actorUserId: data.actorUserId,
        event: "archived",
        payload: { reason: data.reason ?? null } as any,
      });
      return updated;
    });
  }

  async updateAssetKind(
    id: string,
    input: { assetKind: "rig" | "set_prop" | null; actorUserId: string; reason?: string },
  ): Promise<ProductionAsset> {
    const data = parseR5F(updateAssetKindInputSchema, input, "updateAssetKind input");
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(productionAssets)
        .where(eq(productionAssets.id, id))
        .limit(1);
      if (!existing) {
        throw new ProductionAssetStorageError("asset_not_found", `Asset ${id} not found.`);
      }
      const previousMetadata =
        existing.metadata && typeof existing.metadata === "object"
          ? (existing.metadata as Record<string, unknown>)
          : {};
      const previousAssetKind =
        typeof previousMetadata.assetKind === "string"
          ? (previousMetadata.assetKind as string)
          : null;
      const nextMetadata: Record<string, unknown> = { ...previousMetadata };
      if (data.assetKind === null) {
        delete nextMetadata.assetKind;
      } else {
        nextMetadata.assetKind = data.assetKind;
      }
      const [updated] = await tx
        .update(productionAssets)
        .set({ metadata: nextMetadata as any, updatedAt: new Date() })
        .where(eq(productionAssets.id, id))
        .returning();
      await tx.insert(productionAssetAuditLog).values({
        assetId: id,
        actorUserId: data.actorUserId,
        event: "asset_kind_set",
        payload: {
          from: previousAssetKind,
          to: data.assetKind,
          reason: data.reason ?? null,
        } as any,
      });
      return updated;
    });
  }

  async deleteArchivedAsset(
    id: string,
    input: { actorUserId: string; reason?: string },
  ): Promise<{ asset: ProductionAsset; deletedAuditRows: number; snapshotId: string }> {
    const data = parseR5F(deleteArchivedAssetInputSchema, input, "deleteArchivedAsset input");
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(productionAssets)
        .where(eq(productionAssets.id, id))
        .limit(1);
      if (!existing) {
        throw new ProductionAssetStorageError("asset_not_found", `Asset ${id} not found.`);
      }
      if (existing.status !== "archived") {
        throw new ProductionAssetStorageError(
          "asset_not_archived",
          `Asset ${id} cannot be deleted: status='${existing.status}' (must be 'archived').`,
        );
      }

      // Task #783: snapshot the full per-asset audit-log BEFORE the
      // ON DELETE CASCADE on production_asset_audit_log fires, so the
      // admin audit timeline survives the destructive delete.
      const auditRowsBefore = await tx
        .select()
        .from(productionAssetAuditLog)
        .where(eq(productionAssetAuditLog.assetId, id))
        .orderBy(productionAssetAuditLog.createdAt);

      // Record the deletion in moderation_logs because the asset's own
      // audit-log rows cascade-delete with the asset row.
      const [modRow] = await tx
        .insert(moderationLogs)
        .values({
          userId: data.actorUserId,
          contentType: "production_asset",
          contentId: id,
          contentSnippet: `${existing.name} (${existing.format}, ${existing.byteSize}B, sha256=${existing.sha256}, storageKey=${existing.storageKey})`,
          reason: data.reason ?? "permanent deletion of archived 3D asset",
          category: "asset_deletion",
          actionTaken: "production_asset_deleted",
          severity: "high",
        } as any)
        .returning();

      const [snapshot] = await tx
        .insert(productionAssetDeletionSnapshots)
        .values({
          assetId: id,
          moderationLogId: modRow?.id ?? null,
          actorUserId: data.actorUserId,
          reason: data.reason ?? null,
          assetSnapshot: existing as any,
          auditLogSnapshot: auditRowsBefore as any,
          auditRowCount: auditRowsBefore.length,
        })
        .returning({ id: productionAssetDeletionSnapshots.id });

      const deletedAuditRows = await tx
        .delete(productionAssetAuditLog)
        .where(eq(productionAssetAuditLog.assetId, id))
        .returning({ id: productionAssetAuditLog.id });

      await tx.delete(productionAssets).where(eq(productionAssets.id, id));

      return {
        asset: existing,
        deletedAuditRows: deletedAuditRows.length,
        snapshotId: snapshot.id,
      };
    });
  }

  async listAssetDeletionSnapshots(opts: {
    limit: number;
    offset: number;
  }): Promise<{ items: ProductionAssetDeletionSnapshot[]; total: number }> {
    const items = await db
      .select()
      .from(productionAssetDeletionSnapshots)
      .orderBy(desc(productionAssetDeletionSnapshots.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(productionAssetDeletionSnapshots);
    return { items, total: Number(count) };
  }

  async getAssetDeletionSnapshotByAssetId(
    assetId: string,
  ): Promise<ProductionAssetDeletionSnapshot | undefined> {
    const [row] = await db
      .select()
      .from(productionAssetDeletionSnapshots)
      .where(eq(productionAssetDeletionSnapshots.assetId, assetId))
      .orderBy(desc(productionAssetDeletionSnapshots.createdAt))
      .limit(1);
    return row;
  }

  async appendAuditLog(entry: InsertProductionAssetAuditLog): Promise<ProductionAssetAuditLog> {
    const parsed = insertProductionAssetAuditLogSchema.safeParse(entry);
    if (!parsed.success) {
      throw new ProductionAssetStorageError(
        "asset_invalid_input",
        `Invalid audit-log input: ${parsed.error.message}`,
      );
    }
    const [created] = await db.insert(productionAssetAuditLog).values(parsed.data).returning();
    return created;
  }

  async listAuditLogForAsset(
    assetId: string,
    opts: { limit: number },
  ): Promise<ProductionAssetAuditLog[]> {
    return db
      .select()
      .from(productionAssetAuditLog)
      .where(eq(productionAssetAuditLog.assetId, assetId))
      .orderBy(desc(productionAssetAuditLog.createdAt))
      .limit(opts.limit);
  }

  // ------------------------------------------------------------------ //
  // Task #754 — Production Rigs storage layer                          //
  // Mirrors production-assets but for humanoid avatar rigs. publicUrl  //
  // is never written; every mutation appends an audit-log row atomic-  //
  // ally with the parent mutation in a single db.transaction.          //
  // ------------------------------------------------------------------ //

  async createRig(
    input: InsertProductionRig,
    audit: { actorUserId: string; event?: "uploaded" | "imported"; payload?: unknown },
  ): Promise<ProductionRig> {
    const parsed = insertProductionRigSchema.safeParse(input);
    if (!parsed.success) {
      throw new ProductionRigStorageError(
        "rig_invalid_input",
        `Invalid production rig input: ${parsed.error.message}`,
      );
    }
    const safeValues = {
      ...parsed.data,
      status: parsed.data.status ?? "draft",
      lifecycleState: parsed.data.lifecycleState ?? "uploaded",
      licenseStatus: parsed.data.licenseStatus ?? "unknown",
      safetyReview: parsed.data.safetyReview ?? "pending",
      approvalGate: parsed.data.approvalGate ?? "not_approved",
    };
    if (safeValues.approvalGate !== "not_approved") {
      throw new ProductionRigStorageError(
        "rig_invalid_input",
        "New rigs must be created with approvalGate='not_approved'.",
      );
    }
    if (!audit || typeof audit.actorUserId !== "string" || !audit.actorUserId.trim()) {
      throw new ProductionRigStorageError("rig_invalid_input", "createRig audit.actorUserId is required");
    }
    const event = audit.event ?? "uploaded";
    try {
      return await db.transaction(async (tx) => {
        const [created] = await tx.insert(productionRigs).values(safeValues).returning();
        await tx.insert(productionRigAuditLog).values({
          rigId: created.id,
          actorUserId: audit.actorUserId,
          event,
          payload: (audit.payload ?? null) as any,
        });
        return created;
      });
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      const constraint = String(err?.constraint ?? "");
      const isSha256Conflict =
        err?.code === "23505" && (constraint.includes("sha256") || /sha256/i.test(msg));
      if (isSha256Conflict) {
        throw new ProductionRigStorageError(
          "rig_sha256_conflict",
          `A rig with sha256=${safeValues.sha256} already exists.`,
        );
      }
      throw err;
    }
  }

  async getRigById(id: string): Promise<ProductionRig | undefined> {
    const [row] = await db.select().from(productionRigs).where(eq(productionRigs.id, id)).limit(1);
    return row;
  }

  async getRigBySha256(sha256: string): Promise<ProductionRig | undefined> {
    const [row] = await db.select().from(productionRigs).where(eq(productionRigs.sha256, sha256)).limit(1);
    return row;
  }

  async listRigs(opts: {
    status?: string;
    safetyReview?: string;
    approvalGate?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: ProductionRig[]; total: number }> {
    const conds: any[] = [];
    if (opts.status) conds.push(eq(productionRigs.status, opts.status));
    if (opts.safetyReview) conds.push(eq(productionRigs.safetyReview, opts.safetyReview));
    if (opts.approvalGate) conds.push(eq(productionRigs.approvalGate, opts.approvalGate));
    const whereClause = conds.length ? and(...conds) : undefined;

    const itemsQuery = db.select().from(productionRigs);
    const items = await (whereClause ? itemsQuery.where(whereClause) : itemsQuery)
      .orderBy(desc(productionRigs.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    const countQuery = db.select({ count: sql<number>`count(*)::int` }).from(productionRigs);
    const [{ count }] = await (whereClause ? countQuery.where(whereClause) : countQuery);
    return { items, total: Number(count) };
  }

  async updateRigLicense(
    id: string,
    input: { licenseStatus: string; licenseSource?: string | null; licenseNote?: string | null; actorUserId: string },
  ): Promise<ProductionRig> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(productionRigs).where(eq(productionRigs.id, id)).limit(1);
      if (!existing) {
        throw new ProductionRigStorageError("rig_not_found", `Rig ${id} not found.`);
      }
      const [updated] = await tx
        .update(productionRigs)
        .set({
          licenseStatus: input.licenseStatus,
          licenseSource: input.licenseSource ?? null,
          licenseNote: input.licenseNote ?? null,
          lifecycleState:
            input.licenseStatus === "unlicensed_rejected" ? "rejected" : "license_reviewed",
          updatedAt: new Date(),
        })
        .where(eq(productionRigs.id, id))
        .returning();
      await tx.insert(productionRigAuditLog).values({
        rigId: id,
        actorUserId: input.actorUserId,
        event: "license_set",
        payload: {
          licenseStatus: input.licenseStatus,
          licenseSource: input.licenseSource ?? null,
          licenseNote: input.licenseNote ?? null,
        } as any,
      });
      return updated;
    });
  }

  async updateRigSafetyReview(
    id: string,
    input: { safetyReview: string; safetyNote?: string | null; actorUserId: string },
  ): Promise<ProductionRig> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(productionRigs).where(eq(productionRigs.id, id)).limit(1);
      if (!existing) {
        throw new ProductionRigStorageError("rig_not_found", `Rig ${id} not found.`);
      }
      const [updated] = await tx
        .update(productionRigs)
        .set({
          safetyReview: input.safetyReview,
          safetyNote: input.safetyNote ?? null,
          lifecycleState:
            input.safetyReview === "rejected" ? "rejected" : "safety_reviewed",
          updatedAt: new Date(),
        })
        .where(eq(productionRigs.id, id))
        .returning();
      await tx.insert(productionRigAuditLog).values({
        rigId: id,
        actorUserId: input.actorUserId,
        event: "safety_decided",
        payload: {
          safetyReview: input.safetyReview,
          safetyNote: input.safetyNote ?? null,
        } as any,
      });
      return updated;
    });
  }

  async advanceRigApprovalGate(
    id: string,
    input: { actorUserId: string },
  ): Promise<ProductionRig> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(productionRigs).where(eq(productionRigs.id, id)).limit(1);
      if (!existing) {
        throw new ProductionRigStorageError("rig_not_found", `Rig ${id} not found.`);
      }
      if (existing.approvalGate !== "not_approved") {
        throw new ProductionRigStorageError(
          "rig_invalid_approval_transition",
          `Rig ${id} approvalGate is '${existing.approvalGate}'; only 'not_approved → approved_internal' is allowed.`,
        );
      }
      const [updated] = await tx
        .update(productionRigs)
        .set({
          approvalGate: "approved_internal",
          lifecycleState: "approved_internal",
          updatedAt: new Date(),
        })
        .where(eq(productionRigs.id, id))
        .returning();
      await tx.insert(productionRigAuditLog).values({
        rigId: id,
        actorUserId: input.actorUserId,
        event: "approval_advanced",
        payload: { from: "not_approved", to: "approved_internal" } as any,
      });
      return updated;
    });
  }

  async archiveRig(
    id: string,
    input: { actorUserId: string; reason?: string },
  ): Promise<ProductionRig> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(productionRigs).where(eq(productionRigs.id, id)).limit(1);
      if (!existing) {
        throw new ProductionRigStorageError("rig_not_found", `Rig ${id} not found.`);
      }
      const [updated] = await tx
        .update(productionRigs)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(productionRigs.id, id))
        .returning();
      await tx.insert(productionRigAuditLog).values({
        rigId: id,
        actorUserId: input.actorUserId,
        event: "archived",
        payload: { reason: input.reason ?? null } as any,
      });
      return updated;
    });
  }

  async deleteArchivedRig(
    id: string,
    input: { actorUserId: string; reason?: string },
  ): Promise<{ rig: ProductionRig; deletedAuditRows: number }> {
    const actorUserId = (input?.actorUserId ?? "").trim();
    if (!actorUserId) {
      throw new ProductionRigStorageError(
        "rig_invalid_input",
        "deleteArchivedRig actorUserId is required",
      );
    }
    if (input?.reason !== undefined && input.reason.length > 2048) {
      throw new ProductionRigStorageError(
        "rig_invalid_input",
        "deleteArchivedRig reason must be ≤2048 chars",
      );
    }
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(productionRigs)
        .where(eq(productionRigs.id, id))
        .limit(1);
      if (!existing) {
        throw new ProductionRigStorageError("rig_not_found", `Rig ${id} not found.`);
      }
      if (existing.status !== "archived") {
        throw new ProductionRigStorageError(
          "rig_not_archived",
          `Rig ${id} cannot be deleted: status='${existing.status}' (must be 'archived').`,
        );
      }

      // Record the deletion in moderation_logs because the rig's own
      // audit-log rows cascade-delete with the rig row.
      await tx.insert(moderationLogs).values({
        userId: actorUserId,
        contentType: "production_rig",
        contentId: id,
        contentSnippet: `${existing.name} (${existing.format}, ${existing.byteSize}B, sha256=${existing.sha256}, storageKey=${existing.storageKey})`,
        reason: input.reason ?? "permanent deletion of archived avatar rig",
        category: "rig_deletion",
        actionTaken: "production_rig_deleted",
        severity: "high",
      } as any);

      const deletedAuditRows = await tx
        .delete(productionRigAuditLog)
        .where(eq(productionRigAuditLog.rigId, id))
        .returning({ id: productionRigAuditLog.id });

      await tx.delete(productionRigs).where(eq(productionRigs.id, id));

      return { rig: existing, deletedAuditRows: deletedAuditRows.length };
    });
  }

  async appendRigAuditLog(entry: InsertProductionRigAuditLog): Promise<ProductionRigAuditLog> {
    const parsed = insertProductionRigAuditLogSchema.safeParse(entry);
    if (!parsed.success) {
      throw new ProductionRigStorageError(
        "rig_invalid_input",
        `Invalid rig audit-log input: ${parsed.error.message}`,
      );
    }
    const [created] = await db.insert(productionRigAuditLog).values(parsed.data).returning();
    return created;
  }

  async listAuditLogForRig(
    rigId: string,
    opts: { limit: number },
  ): Promise<ProductionRigAuditLog[]> {
    return db
      .select()
      .from(productionRigAuditLog)
      .where(eq(productionRigAuditLog.rigId, rigId))
      .orderBy(desc(productionRigAuditLog.createdAt))
      .limit(opts.limit);
  }

  // ===================================================================
  // R7B — Permanent Avatars
  // ===================================================================

  private derivePermanentAvatarLifecycleState(
    identityReview: string,
    safetyReview: string,
    approvalGate: string,
  ): string {
    if (approvalGate === "approved_internal") return "approved_internal";
    if (
      identityReview === "approved_internal" &&
      safetyReview === "approved_internal"
    ) {
      return "safety_reviewed";
    }
    if (identityReview === "approved_internal") return "identity_reviewed";
    return "composed";
  }

  private async assertPermanentAvatarSlugAvailable(
    tx: any,
    slug: string,
  ): Promise<void> {
    const [hitLive] = await tx
      .select({ id: permanentAvatars.id })
      .from(permanentAvatars)
      .where(eq(permanentAvatars.slug, slug))
      .limit(1);
    if (hitLive) {
      throw new PermanentAvatarStorageError(
        "avatar_slug_conflict",
        `Slug '${slug}' is already used by an existing permanent avatar.`,
      );
    }
    const [hitTomb] = await tx
      .select({ id: permanentAvatarTombstones.id })
      .from(permanentAvatarTombstones)
      .where(eq(permanentAvatarTombstones.slug, slug))
      .limit(1);
    if (hitTomb) {
      throw new PermanentAvatarStorageError(
        "avatar_slug_conflict",
        `Slug '${slug}' was permanently burned by a prior deleted avatar.`,
      );
    }
  }

  private async assertPairApprovedInternal(
    tx: any,
    bodyAssetId: string,
    rigId: string,
  ): Promise<{ asset: ProductionAsset; rig: ProductionRig }> {
    const [asset] = await tx
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, bodyAssetId))
      .limit(1);
    const [rig] = await tx
      .select()
      .from(productionRigs)
      .where(eq(productionRigs.id, rigId))
      .limit(1);
    if (!asset) {
      throw new PermanentAvatarStorageError(
        "avatar_pair_validity_failed",
        `Body asset ${bodyAssetId} not found.`,
        { bodyAssetId },
      );
    }
    if (!rig) {
      throw new PermanentAvatarStorageError(
        "avatar_pair_validity_failed",
        `Rig ${rigId} not found.`,
        { rigId },
      );
    }
    if (asset.approvalGate !== "approved_internal" || asset.status === "archived") {
      throw new PermanentAvatarStorageError(
        "avatar_pair_not_approved_internal",
        `Body asset ${bodyAssetId} is not approved_internal (approvalGate='${asset.approvalGate}', status='${asset.status}').`,
        { bodyAssetId, approvalGate: asset.approvalGate, status: asset.status },
      );
    }
    if (rig.approvalGate !== "approved_internal" || rig.status === "archived") {
      throw new PermanentAvatarStorageError(
        "avatar_pair_not_approved_internal",
        `Rig ${rigId} is not approved_internal (approvalGate='${rig.approvalGate}', status='${rig.status}').`,
        { rigId, approvalGate: rig.approvalGate, status: rig.status },
      );
    }
    return { asset, rig };
  }

  async createPermanentAvatar(
    input: InsertPermanentAvatar,
    audit: { actorUserId: string },
  ): Promise<PermanentAvatar> {
    const parsed = insertPermanentAvatarSchema.safeParse(input);
    if (!parsed.success) {
      throw new PermanentAvatarStorageError(
        "avatar_invalid_input",
        `Invalid permanent avatar input: ${parsed.error.message}`,
      );
    }
    if (!audit?.actorUserId?.trim()) {
      throw new PermanentAvatarStorageError(
        "avatar_invalid_input",
        "createPermanentAvatar audit.actorUserId is required",
      );
    }
    const values = parsed.data;
    try {
      return await db.transaction(async (tx) => {
        await this.assertPermanentAvatarSlugAvailable(tx, values.slug);
        await this.assertPairApprovedInternal(
          tx,
          values.bodyAssetId,
          values.rigId,
        );
        const [created] = await tx
          .insert(permanentAvatars)
          .values({
            ...values,
            status: "draft",
            lifecycleState: "composed",
            identityReview: "pending",
            safetyReview: "pending",
            approvalGate: "not_approved",
          } as any)
          .returning();
        await tx.insert(permanentAvatarAuditLog).values({
          permanentAvatarId: created.id,
          actorUserId: audit.actorUserId,
          event: "avatar.created",
          payload: {
            bodyAssetId: values.bodyAssetId,
            rigId: values.rigId,
            slug: values.slug,
            displayName: values.displayName,
          } as any,
        });
        return created;
      });
    } catch (err: any) {
      if (err instanceof PermanentAvatarStorageError) throw err;
      const msg = String(err?.message ?? "");
      if (err?.code === "23505" && /slug/i.test(msg)) {
        throw new PermanentAvatarStorageError(
          "avatar_slug_conflict",
          `Slug '${values.slug}' is already in use.`,
        );
      }
      if (err?.code === "23505" && /body_rig_pair/i.test(msg)) {
        throw new PermanentAvatarStorageError(
          "avatar_invalid_input",
          `A permanent avatar already binds this exact body+rig pair.`,
        );
      }
      throw err;
    }
  }

  async getPermanentAvatarById(
    id: string,
  ): Promise<PermanentAvatar | undefined> {
    const [row] = await db
      .select()
      .from(permanentAvatars)
      .where(eq(permanentAvatars.id, id))
      .limit(1);
    return row;
  }

  async listPermanentAvatars(opts: {
    status?: string;
    approvalGate?: string;
    identityReview?: string;
    safetyReview?: string;
    bodyAssetId?: string;
    rigId?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: PermanentAvatar[]; total: number }> {
    const conds: any[] = [];
    if (opts.status) conds.push(eq(permanentAvatars.status, opts.status));
    if (opts.approvalGate)
      conds.push(eq(permanentAvatars.approvalGate, opts.approvalGate));
    if (opts.identityReview)
      conds.push(eq(permanentAvatars.identityReview, opts.identityReview));
    if (opts.safetyReview)
      conds.push(eq(permanentAvatars.safetyReview, opts.safetyReview));
    if (opts.bodyAssetId)
      conds.push(eq(permanentAvatars.bodyAssetId, opts.bodyAssetId));
    if (opts.rigId) conds.push(eq(permanentAvatars.rigId, opts.rigId));
    const whereClause = conds.length ? and(...conds) : undefined;

    const itemsQuery = db.select().from(permanentAvatars);
    const items = await (whereClause
      ? itemsQuery.where(whereClause)
      : itemsQuery)
      .orderBy(desc(permanentAvatars.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(permanentAvatars);
    const [{ count }] = await (whereClause
      ? countQuery.where(whereClause)
      : countQuery);
    return { items, total: Number(count) };
  }

  async updatePermanentAvatarIdentityFields(
    id: string,
    input: {
      fields: Record<string, any>;
      actorUserId: string;
    },
  ): Promise<PermanentAvatar> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(permanentAvatars)
        .where(eq(permanentAvatars.id, id))
        .limit(1);
      if (!existing) {
        throw new PermanentAvatarStorageError(
          "avatar_not_found",
          `Permanent avatar ${id} not found.`,
        );
      }
      const allowed: Record<string, any> = {};
      for (const k of [
        "displayName",
        "personaSummary",
        "voiceProfileHint",
        "languageHint",
        "rolePreset",
        "defaultRoomKind",
        "defaultRoomId",
      ]) {
        if (input.fields[k] !== undefined) allowed[k] = input.fields[k];
      }
      if (Object.keys(allowed).length === 0) {
        return existing;
      }
      const [updated] = await tx
        .update(permanentAvatars)
        .set({ ...allowed, updatedAt: new Date() })
        .where(eq(permanentAvatars.id, id))
        .returning();
      await tx.insert(permanentAvatarAuditLog).values({
        permanentAvatarId: id,
        actorUserId: input.actorUserId,
        event: "avatar.identity_updated",
        payload: { changes: allowed } as any,
      });
      return updated;
    });
  }

  async rebindPermanentAvatar(
    id: string,
    input: {
      bodyAssetId?: string;
      rigId?: string;
      reason?: string | null;
      actorUserId: string;
    },
  ): Promise<PermanentAvatar> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(permanentAvatars)
        .where(eq(permanentAvatars.id, id))
        .limit(1);
      if (!existing) {
        throw new PermanentAvatarStorageError(
          "avatar_not_found",
          `Permanent avatar ${id} not found.`,
        );
      }
      const nextBody = input.bodyAssetId ?? existing.bodyAssetId;
      const nextRig = input.rigId ?? existing.rigId;
      await this.assertPairApprovedInternal(tx, nextBody, nextRig);
      const [updated] = await tx
        .update(permanentAvatars)
        .set({
          bodyAssetId: nextBody,
          rigId: nextRig,
          identityReview: "pending",
          identityReviewNote: null,
          safetyReview: "pending",
          safetyReviewNote: null,
          approvalGate: "not_approved",
          lifecycleState: "composed",
          updatedAt: new Date(),
        })
        .where(eq(permanentAvatars.id, id))
        .returning();
      await tx.insert(permanentAvatarAuditLog).values({
        permanentAvatarId: id,
        actorUserId: input.actorUserId,
        event: "avatar.rebound",
        payload: {
          from: {
            bodyAssetId: existing.bodyAssetId,
            rigId: existing.rigId,
          },
          to: { bodyAssetId: nextBody, rigId: nextRig },
          reason: input.reason ?? null,
        } as any,
      });
      return updated;
    });
  }

  async setPermanentAvatarIdentityReview(
    id: string,
    input: { decision: string; note?: string | null; actorUserId: string },
  ): Promise<PermanentAvatar> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(permanentAvatars)
        .where(eq(permanentAvatars.id, id))
        .limit(1);
      if (!existing) {
        throw new PermanentAvatarStorageError(
          "avatar_not_found",
          `Permanent avatar ${id} not found.`,
        );
      }
      const nextLifecycle = this.derivePermanentAvatarLifecycleState(
        input.decision,
        existing.safetyReview,
        existing.approvalGate,
      );
      const [updated] = await tx
        .update(permanentAvatars)
        .set({
          identityReview: input.decision,
          identityReviewNote: input.note ?? null,
          lifecycleState: nextLifecycle,
          updatedAt: new Date(),
        })
        .where(eq(permanentAvatars.id, id))
        .returning();
      await tx.insert(permanentAvatarAuditLog).values({
        permanentAvatarId: id,
        actorUserId: input.actorUserId,
        event: "avatar.identity_reviewed",
        payload: {
          decision: input.decision,
          note: input.note ?? null,
        } as any,
      });
      return updated;
    });
  }

  async setPermanentAvatarSafetyReview(
    id: string,
    input: { decision: string; note?: string | null; actorUserId: string },
  ): Promise<PermanentAvatar> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(permanentAvatars)
        .where(eq(permanentAvatars.id, id))
        .limit(1);
      if (!existing) {
        throw new PermanentAvatarStorageError(
          "avatar_not_found",
          `Permanent avatar ${id} not found.`,
        );
      }
      const nextLifecycle = this.derivePermanentAvatarLifecycleState(
        existing.identityReview,
        input.decision,
        existing.approvalGate,
      );
      const [updated] = await tx
        .update(permanentAvatars)
        .set({
          safetyReview: input.decision,
          safetyReviewNote: input.note ?? null,
          lifecycleState: nextLifecycle,
          updatedAt: new Date(),
        })
        .where(eq(permanentAvatars.id, id))
        .returning();
      await tx.insert(permanentAvatarAuditLog).values({
        permanentAvatarId: id,
        actorUserId: input.actorUserId,
        event: "avatar.safety_reviewed",
        payload: {
          decision: input.decision,
          note: input.note ?? null,
        } as any,
      });
      return updated;
    });
  }

  async advancePermanentAvatarApprovalGate(
    id: string,
    input: { actorUserId: string },
  ): Promise<PermanentAvatar> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(permanentAvatars)
        .where(eq(permanentAvatars.id, id))
        .limit(1);
      if (!existing) {
        throw new PermanentAvatarStorageError(
          "avatar_not_found",
          `Permanent avatar ${id} not found.`,
        );
      }
      if (existing.approvalGate !== "not_approved") {
        throw new PermanentAvatarStorageError(
          "avatar_invalid_state_transition",
          `Avatar ${id} approvalGate is '${existing.approvalGate}'; only 'not_approved → approved_internal' is allowed.`,
        );
      }
      if (existing.status === "archived") {
        throw new PermanentAvatarStorageError(
          "avatar_invalid_state_transition",
          `Avatar ${id} is archived; cannot advance approval.`,
        );
      }
      if (
        existing.identityReview !== "approved_internal" ||
        existing.safetyReview !== "approved_internal"
      ) {
        throw new PermanentAvatarStorageError(
          "avatar_review_not_approved",
          `Avatar ${id} cannot be approved: identityReview='${existing.identityReview}', safetyReview='${existing.safetyReview}' (both must be 'approved_internal').`,
        );
      }
      await this.assertPairApprovedInternal(
        tx,
        existing.bodyAssetId,
        existing.rigId,
      );
      const [updated] = await tx
        .update(permanentAvatars)
        .set({
          approvalGate: "approved_internal",
          lifecycleState: "approved_internal",
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(permanentAvatars.id, id))
        .returning();
      await tx.insert(permanentAvatarAuditLog).values({
        permanentAvatarId: id,
        actorUserId: input.actorUserId,
        event: "avatar.approved",
        payload: { from: "not_approved", to: "approved_internal" } as any,
      });
      return updated;
    });
  }

  async archivePermanentAvatar(
    id: string,
    input: { actorUserId: string; reason?: string | null },
  ): Promise<PermanentAvatar> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(permanentAvatars)
        .where(eq(permanentAvatars.id, id))
        .limit(1);
      if (!existing) {
        throw new PermanentAvatarStorageError(
          "avatar_not_found",
          `Permanent avatar ${id} not found.`,
        );
      }
      if (existing.status === "archived") {
        throw new PermanentAvatarStorageError(
          "avatar_already_archived",
          `Avatar ${id} is already archived.`,
        );
      }
      const [updated] = await tx
        .update(permanentAvatars)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(permanentAvatars.id, id))
        .returning();
      await tx.insert(permanentAvatarAuditLog).values({
        permanentAvatarId: id,
        actorUserId: input.actorUserId,
        event: "avatar.archived",
        payload: { reason: input.reason ?? null } as any,
      });
      return updated;
    });
  }

  async unarchivePermanentAvatar(
    id: string,
    input: { actorUserId: string },
  ): Promise<PermanentAvatar> {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(permanentAvatars)
        .where(eq(permanentAvatars.id, id))
        .limit(1);
      if (!existing) {
        throw new PermanentAvatarStorageError(
          "avatar_not_found",
          `Permanent avatar ${id} not found.`,
        );
      }
      if (existing.status !== "archived") {
        throw new PermanentAvatarStorageError(
          "avatar_invalid_state_transition",
          `Avatar ${id} is not archived (status='${existing.status}').`,
        );
      }
      const nextStatus =
        existing.approvalGate === "approved_internal" ? "active" : "draft";
      const [updated] = await tx
        .update(permanentAvatars)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(permanentAvatars.id, id))
        .returning();
      await tx.insert(permanentAvatarAuditLog).values({
        permanentAvatarId: id,
        actorUserId: input.actorUserId,
        event: "avatar.unarchived",
        payload: { to: nextStatus } as any,
      });
      return updated;
    });
  }

  async deleteArchivedPermanentAvatar(
    id: string,
    input: { actorUserId: string; reason: string },
  ): Promise<{ deletedAuditRows: number; tombstoneId: string }> {
    const actorUserId = (input?.actorUserId ?? "").trim();
    if (!actorUserId) {
      throw new PermanentAvatarStorageError(
        "avatar_invalid_input",
        "deleteArchivedPermanentAvatar actorUserId is required",
      );
    }
    const reason = (input?.reason ?? "").trim();
    if (!reason) {
      throw new PermanentAvatarStorageError(
        "avatar_invalid_input",
        "deleteArchivedPermanentAvatar reason is required",
      );
    }
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(permanentAvatars)
        .where(eq(permanentAvatars.id, id))
        .limit(1);
      if (!existing) {
        throw new PermanentAvatarStorageError(
          "avatar_not_found",
          `Permanent avatar ${id} not found.`,
        );
      }
      if (existing.status !== "archived") {
        throw new PermanentAvatarStorageError(
          "avatar_not_archived",
          `Avatar ${id} cannot be deleted: status='${existing.status}' (must be 'archived').`,
        );
      }

      const auditRowsBefore = await tx
        .select()
        .from(permanentAvatarAuditLog)
        .where(eq(permanentAvatarAuditLog.permanentAvatarId, id))
        .orderBy(permanentAvatarAuditLog.createdAt);

      // Write the immutable tombstone FIRST so the slug burn + final
      // snapshot survive the audit-log cascade that follows the parent
      // delete. Tombstone table has no FK to permanent_avatars by
      // design; DB triggers reject any later UPDATE/DELETE.
      const [tomb] = await tx
        .insert(permanentAvatarTombstones)
        .values({
          originalPermanentAvatarId: existing.id,
          slug: existing.slug,
          displayName: existing.displayName,
          bodyAssetId: existing.bodyAssetId,
          rigId: existing.rigId,
          finalSnapshot: existing as any,
          auditLogCount: auditRowsBefore.length,
          deletedByUserId: actorUserId,
          deletionReason: reason,
        } as any)
        .returning();

      // Record the deletion in moderation_logs because the avatar's
      // own audit-log rows cascade-delete with the parent row.
      await tx.insert(moderationLogs).values({
        userId: actorUserId,
        contentType: "permanent_avatar",
        contentId: id,
        contentSnippet: `${existing.displayName} (slug=${existing.slug}, bodyAssetId=${existing.bodyAssetId}, rigId=${existing.rigId})`,
        reason,
        category: "permanent_avatar_deletion",
        actionTaken: "permanent_avatar_deleted",
        severity: "high",
      } as any);

      await tx.delete(permanentAvatars).where(eq(permanentAvatars.id, id));

      return {
        deletedAuditRows: auditRowsBefore.length,
        tombstoneId: tomb.id,
      };
    });
  }

  async appendPermanentAvatarAuditLog(
    entry: InsertPermanentAvatarAuditLog,
  ): Promise<PermanentAvatarAuditLog> {
    const parsed = insertPermanentAvatarAuditLogSchema.safeParse(entry);
    if (!parsed.success) {
      throw new PermanentAvatarStorageError(
        "avatar_invalid_input",
        `Invalid permanent-avatar audit-log input: ${parsed.error.message}`,
      );
    }
    const [created] = await db
      .insert(permanentAvatarAuditLog)
      .values(parsed.data)
      .returning();
    return created;
  }

  async listPermanentAvatarAuditLog(
    id: string,
    opts: { limit: number },
  ): Promise<PermanentAvatarAuditLog[]> {
    return db
      .select()
      .from(permanentAvatarAuditLog)
      .where(eq(permanentAvatarAuditLog.permanentAvatarId, id))
      .orderBy(desc(permanentAvatarAuditLog.createdAt))
      .limit(opts.limit);
  }

  async getPermanentAvatarBoundSummaries(
    avatar: PermanentAvatar,
  ): Promise<{
    bodyAsset: ProductionAsset | null;
    rig: ProductionRig | null;
  }> {
    const [asset] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, avatar.bodyAssetId))
      .limit(1);
    const [rig] = await db
      .select()
      .from(productionRigs)
      .where(eq(productionRigs.id, avatar.rigId))
      .limit(1);
    return { bodyAsset: asset ?? null, rig: rig ?? null };
  }

  async countPermanentAvatarsReferencingAsset(
    assetId: string,
  ): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(permanentAvatars)
      .where(eq(permanentAvatars.bodyAssetId, assetId));
    return Number(count);
  }

  async countPermanentAvatarsReferencingRig(rigId: string): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(permanentAvatars)
      .where(eq(permanentAvatars.rigId, rigId));
    return Number(count);
  }
}

export const storage = new DatabaseStorage();
