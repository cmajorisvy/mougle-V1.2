import { db } from "../db";
import {
  riskAuditLogs, riskSnapshots, dataRequests,
  users as usersTable, posts as postsTable,
  comments as commentsTable,
  type InsertRiskAuditLog,
} from "@shared/schema";
import { eq, sql, desc, and, gte, lte, count } from "drizzle-orm";
import { aiGateway } from "./ai-gateway";
import { privacyGatewayService } from "./privacy-gateway-service";

type RiskCategory = "technical" | "economic" | "privacy" | "ecosystem" | "legal";

interface RiskIndicator {
  category: RiskCategory;
  name: string;
  value: number;
  threshold: number;
  status: "healthy" | "warning" | "critical";
  description: string;
}

class RiskManagementService {
  async logAudit(entry: InsertRiskAuditLog): Promise<void> {
    try {
      await db.insert(riskAuditLogs).values(entry);
    } catch (err) {
      console.error("Failed to log audit entry:", err);
    }
  }

  async getRiskOverview(): Promise<{
    indicators: RiskIndicator[];
    overallScore: number;
    overallStatus: string;
    categoryScores: Record<RiskCategory, number>;
  }> {
    const indicators: RiskIndicator[] = [];

    const gwMetrics = aiGateway.getGatewayMetrics();
    const failRate = gwMetrics.totalRequests > 0
      ? (gwMetrics.failedRequests / gwMetrics.totalRequests) * 100 : 0;
    indicators.push({
      category: "technical",
      name: "AI Gateway Failure Rate",
      value: Math.round(failRate * 10) / 10,
      threshold: 10,
      status: failRate > 15 ? "critical" : failRate > 10 ? "warning" : "healthy",
      description: `${gwMetrics.failedRequests} failed of ${gwMetrics.totalRequests} total requests`,
    });

    indicators.push({
      category: "technical",
      name: "Rate Limit Blocks",
      value: gwMetrics.blockedByRateLimit,
      threshold: 50,
      status: gwMetrics.blockedByRateLimit > 100 ? "critical" : gwMetrics.blockedByRateLimit > 50 ? "warning" : "healthy",
      description: `${gwMetrics.blockedByRateLimit} requests blocked by rate limiting`,
    });

    indicators.push({
      category: "technical",
      name: "Active Chain Depth",
      value: gwMetrics.activeChains,
      threshold: 10,
      status: gwMetrics.activeChains > 20 ? "critical" : gwMetrics.activeChains > 10 ? "warning" : "healthy",
      description: `${gwMetrics.activeChains} active processing chains`,
    });

    const creditBlocks = gwMetrics.blockedByCredits;
    indicators.push({
      category: "economic",
      name: "Credit Insufficiency Blocks",
      value: creditBlocks,
      threshold: 20,
      status: creditBlocks > 50 ? "critical" : creditBlocks > 20 ? "warning" : "healthy",
      description: `${creditBlocks} AI calls blocked due to insufficient credits`,
    });

    const [creditStats] = await db.select({
      totalCredits: sql<number>`COALESCE(SUM(${usersTable.creditWallet}), 0)`,
      avgCredits: sql<number>`COALESCE(AVG(${usersTable.creditWallet}), 0)`,
      totalUsers: count(),
    }).from(usersTable);

    indicators.push({
      category: "economic",
      name: "Average Credit Balance",
      value: Math.round(creditStats?.avgCredits || 0),
      threshold: 50,
      status: (creditStats?.avgCredits || 0) < 10 ? "critical" : (creditStats?.avgCredits || 0) < 50 ? "warning" : "healthy",
      description: `Average ${Math.round(creditStats?.avgCredits || 0)} credits per user`,
    });

    let privacyData: any = { totalViolations: 0, unresolvedViolations: [], severityBreakdown: { critical: 0, high: 0, medium: 0, low: 0 } };
    try {
      privacyData = await privacyGatewayService.getFounderMonitoring();
    } catch {}

    const criticalViolations = privacyData.severityBreakdown?.critical || 0;
    const unresolvedCount = privacyData.unresolvedViolations?.length || 0;
    indicators.push({
      category: "privacy",
      name: "Privacy Violations",
      value: privacyData.totalViolations || 0,
      threshold: 5,
      status: criticalViolations > 0 ? "critical" : unresolvedCount > 5 ? "warning" : "healthy",
      description: `${unresolvedCount} unresolved, ${criticalViolations} critical`,
    });

    indicators.push({
      category: "privacy",
      name: "Unresolved Violations",
      value: unresolvedCount,
      threshold: 3,
      status: unresolvedCount > 10 ? "critical" : unresolvedCount > 3 ? "warning" : "healthy",
      description: `${unresolvedCount} privacy violations awaiting resolution`,
    });

    const [spamStats] = await db.select({
      spammers: sql<number>`COUNT(*) FILTER (WHERE ${usersTable.isSpammer} = true)`,
      shadowBanned: sql<number>`COUNT(*) FILTER (WHERE ${usersTable.isShadowBanned} = true)`,
      totalUsers: count(),
    }).from(usersTable);

    const spamRate = (spamStats?.totalUsers || 0) > 0
      ? ((spamStats?.spammers || 0) / (spamStats?.totalUsers || 1)) * 100 : 0;
    indicators.push({
      category: "ecosystem",
      name: "Spam Rate",
      value: Math.round(spamRate * 10) / 10,
      threshold: 5,
      status: spamRate > 10 ? "critical" : spamRate > 5 ? "warning" : "healthy",
      description: `${spamStats?.spammers || 0} spammers, ${spamStats?.shadowBanned || 0} shadow-banned`,
    });

    const [contentStats] = await db.select({
      totalPosts: count(),
    }).from(postsTable);

    indicators.push({
      category: "ecosystem",
      name: "Content Volume",
      value: contentStats?.totalPosts || 0,
      threshold: 0,
      status: "healthy",
      description: `${contentStats?.totalPosts || 0} total posts on platform`,
    });

    const [pendingExports] = await db.select({ count: count() }).from(dataRequests)
      .where(and(eq(dataRequests.requestType, "export"), eq(dataRequests.status, "pending")));
    const [pendingDeletions] = await db.select({ count: count() }).from(dataRequests)
      .where(and(eq(dataRequests.requestType, "deletion"), eq(dataRequests.status, "pending")));

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [overdueDeletions] = await db.select({ count: count() }).from(dataRequests)
      .where(and(
        eq(dataRequests.requestType, "deletion"),
        eq(dataRequests.status, "pending"),
        lte(dataRequests.requestedAt, thirtyDaysAgo),
      ));

    indicators.push({
      category: "legal",
      name: "Pending Data Exports",
      value: pendingExports?.count || 0,
      threshold: 10,
      status: (pendingExports?.count || 0) > 20 ? "critical" : (pendingExports?.count || 0) > 10 ? "warning" : "healthy",
      description: `${pendingExports?.count || 0} data export requests awaiting processing`,
    });

    indicators.push({
      category: "legal",
      name: "Pending Deletions",
      value: pendingDeletions?.count || 0,
      threshold: 5,
      status: (overdueDeletions?.count || 0) > 0 ? "critical" : (pendingDeletions?.count || 0) > 5 ? "warning" : "healthy",
      description: `${pendingDeletions?.count || 0} deletion requests (${overdueDeletions?.count || 0} overdue)`,
    });

    const categoryScores: Record<RiskCategory, number> = { technical: 0, economic: 0, privacy: 0, ecosystem: 0, legal: 0 };
    const categoryCounts: Record<RiskCategory, number> = { technical: 0, economic: 0, privacy: 0, ecosystem: 0, legal: 0 };

    for (const ind of indicators) {
      const score = ind.status === "critical" ? 80 : ind.status === "warning" ? 40 : 10;
      categoryScores[ind.category] += score;
      categoryCounts[ind.category]++;
    }

    for (const cat of Object.keys(categoryScores) as RiskCategory[]) {
      categoryScores[cat] = categoryCounts[cat] > 0
        ? Math.round(categoryScores[cat] / categoryCounts[cat]) : 0;
    }

    const overallScore = Math.round(
      Object.values(categoryScores).reduce((a, b) => a + b, 0) / 5
    );

    const overallStatus = overallScore > 60 ? "critical" : overallScore > 30 ? "warning" : "healthy";

    return { indicators, overallScore, overallStatus, categoryScores };
  }

  async getAuditLogs(opts: { limit?: number; actorId?: string; action?: string; riskLevel?: string } = {}) {
    const conditions = [];
    if (opts.actorId) conditions.push(eq(riskAuditLogs.actorId, opts.actorId));
    if (opts.action) conditions.push(eq(riskAuditLogs.action, opts.action));
    if (opts.riskLevel) conditions.push(eq(riskAuditLogs.riskLevel, opts.riskLevel));

    const query = db.select().from(riskAuditLogs)
      .orderBy(desc(riskAuditLogs.createdAt))
      .limit(opts.limit || 100);

    if (conditions.length > 0) {
      return query.where(and(...conditions));
    }
    return query;
  }

  async getRiskSnapshots(limit = 30) {
    return db.select().from(riskSnapshots)
      .orderBy(desc(riskSnapshots.snapshotDate))
      .limit(limit);
  }

  async createSnapshot(): Promise<void> {
    const overview = await this.getRiskOverview();

    const gwMetrics = aiGateway.getGatewayMetrics();
    let privacyData: any = { totalViolations: 0, unresolvedViolations: [], severityBreakdown: { critical: 0 } };
    try {
      privacyData = await privacyGatewayService.getFounderMonitoring();
    } catch {}

    const [creditStats] = await db.select({
      totalCredits: sql<number>`COALESCE(SUM(${usersTable.creditWallet}), 0)`,
      avgCredits: sql<number>`COALESCE(AVG(${usersTable.creditWallet}), 0)`,
    }).from(usersTable);

    const [userStats] = await db.select({
      total: count(),
      active: sql<number>`COUNT(*) FILTER (WHERE ${usersTable.createdAt} > NOW() - INTERVAL '30 days')`,
      agents: sql<number>`COUNT(*) FILTER (WHERE ${usersTable.role} = 'agent')`,
      spamRate: sql<number>`CAST(COUNT(*) FILTER (WHERE ${usersTable.isSpammer} = true) AS FLOAT) / GREATEST(COUNT(*), 1) * 100`,
    }).from(usersTable);

    const [pendingExports] = await db.select({ count: count() }).from(dataRequests)
      .where(and(eq(dataRequests.requestType, "export"), eq(dataRequests.status, "pending")));
    const [pendingDeletions] = await db.select({ count: count() }).from(dataRequests)
      .where(and(eq(dataRequests.requestType, "deletion"), eq(dataRequests.status, "pending")));

    await db.insert(riskSnapshots).values({
      technicalRisk: overview.categoryScores.technical,
      economicRisk: overview.categoryScores.economic,
      privacyRisk: overview.categoryScores.privacy,
      ecosystemRisk: overview.categoryScores.ecosystem,
      legalRisk: overview.categoryScores.legal,
      overallRisk: overview.overallScore,
      metrics: {
        aiGateway: {
          totalRequests: gwMetrics.totalRequests,
          failedRequests: gwMetrics.failedRequests,
          blockedByCredits: gwMetrics.blockedByCredits,
          blockedByRateLimit: gwMetrics.blockedByRateLimit,
        },
        privacy: {
          totalViolations: privacyData.totalViolations || 0,
          unresolvedViolations: privacyData.unresolvedViolations?.length || 0,
          criticalViolations: privacyData.severityBreakdown?.critical || 0,
        },
        economy: {
          totalCreditsInCirculation: creditStats?.totalCredits || 0,
          avgCreditBalance: Math.round(creditStats?.avgCredits || 0),
          creditBurnRate: gwMetrics.totalCreditsCharged,
        },
        ecosystem: {
          totalUsers: userStats?.total || 0,
          activeUsers: userStats?.active || 0,
          totalAgents: userStats?.agents || 0,
          contentQuality: 0,
          spamRate: Math.round((userStats?.spamRate || 0) * 10) / 10,
        },
        legal: {
          pendingExports: pendingExports?.count || 0,
          pendingDeletions: pendingDeletions?.count || 0,
          overdueDeletions: 0,
        },
      },
    });
  }

  async requestDataExport(userId: string): Promise<{ id: string }> {
    const [existing] = await db.select().from(dataRequests)
      .where(and(
        eq(dataRequests.userId, userId),
        eq(dataRequests.requestType, "export"),
        eq(dataRequests.status, "pending"),
      ));
    if (existing) return { id: existing.id };

    const [request] = await db.insert(dataRequests).values({
      userId,
      requestType: "export",
      status: "pending",
    }).returning();

    await this.logAudit({
      actorId: userId,
      actorType: "user",
      action: "data_export",
      resourceType: "user_data",
      resourceId: userId,
      outcome: "success",
      riskLevel: "medium",
      details: { requestId: request.id },
    });

    return { id: request.id };
  }

  async processDataExport(requestId: string): Promise<any> {
    const [request] = await db.select().from(dataRequests).where(eq(dataRequests.id, requestId));
    if (!request) throw new Error("Request not found");

    await db.update(dataRequests).set({ status: "processing", processedAt: new Date() }).where(eq(dataRequests.id, requestId));

    const userId = request.userId;

    const [user] = await db.select({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      displayName: usersTable.displayName,
      role: usersTable.role,
      reputation: usersTable.reputation,
      rankLevel: usersTable.rankLevel,
      creditWallet: usersTable.creditWallet,
      createdAt: usersTable.createdAt,
    }).from(usersTable).where(eq(usersTable.id, userId));

    const userPosts = await db.select({
      id: postsTable.id,
      title: postsTable.title,
      content: postsTable.content,
      topicSlug: postsTable.topicSlug,
      createdAt: postsTable.createdAt,
    }).from(postsTable).where(eq(postsTable.authorId, userId));

    const userComments = await db.select({
      id: commentsTable.id,
      content: commentsTable.content,
      postId: commentsTable.postId,
      createdAt: commentsTable.createdAt,
    }).from(commentsTable).where(eq(commentsTable.authorId, userId));

    const exportData = {
      exportedAt: new Date().toISOString(),
      user,
      posts: userPosts,
      comments: userComments,
    };

    await db.update(dataRequests).set({
      status: "completed",
      completedAt: new Date(),
      metadata: { recordCounts: { posts: userPosts.length, comments: userComments.length } },
    }).where(eq(dataRequests.id, requestId));

    return exportData;
  }

  async requestDataDeletion(userId: string): Promise<{ id: string }> {
    const [existing] = await db.select().from(dataRequests)
      .where(and(
        eq(dataRequests.userId, userId),
        eq(dataRequests.requestType, "deletion"),
        eq(dataRequests.status, "pending"),
      ));
    if (existing) return { id: existing.id };

    const [request] = await db.insert(dataRequests).values({
      userId,
      requestType: "deletion",
      status: "pending",
    }).returning();

    await this.logAudit({
      actorId: userId,
      actorType: "user",
      action: "data_delete",
      resourceType: "user_data",
      resourceId: userId,
      outcome: "success",
      riskLevel: "high",
      details: { requestId: request.id },
    });

    return { id: request.id };
  }

  async processDataDeletion(requestId: string): Promise<void> {
    const [request] = await db.select().from(dataRequests).where(eq(dataRequests.id, requestId));
    if (!request) throw new Error("Request not found");

    await db.update(dataRequests).set({ status: "processing", processedAt: new Date() }).where(eq(dataRequests.id, requestId));

    const userId = request.userId;

    await db.delete(commentsTable).where(eq(commentsTable.authorId, userId));
    await db.delete(postsTable).where(eq(postsTable.authorId, userId));

    await db.update(usersTable).set({
      email: `deleted_${userId}@removed.local`,
      username: `deleted_${userId}`,
      displayName: "Deleted User",
      password: "DELETED",
      avatar: null,
      bio: null,
      publicKey: null,
      apiToken: null,
      byoaiApiKey: null,
    }).where(eq(usersTable.id, userId));

    await db.update(dataRequests).set({
      status: "completed",
      completedAt: new Date(),
    }).where(eq(dataRequests.id, requestId));

    await this.logAudit({
      actorId: "system",
      actorType: "system",
      action: "data_delete",
      resourceType: "user_data",
      resourceId: userId,
      outcome: "success",
      riskLevel: "critical",
      details: { requestId, action: "user_data_deleted" },
    });
  }

  async getDataRequests(opts: { status?: string; type?: string; limit?: number } = {}) {
    const conditions = [];
    if (opts.status) conditions.push(eq(dataRequests.status, opts.status));
    if (opts.type) conditions.push(eq(dataRequests.requestType, opts.type));

    const query = db.select().from(dataRequests)
      .orderBy(desc(dataRequests.requestedAt))
      .limit(opts.limit || 50);

    if (conditions.length > 0) {
      return query.where(and(...conditions));
    }
    return query;
  }

  async getDataRequestById(id: string) {
    const [request] = await db.select().from(dataRequests).where(eq(dataRequests.id, id));
    return request;
  }

  async getUserDataRequests(userId: string) {
    return db.select().from(dataRequests)
      .where(eq(dataRequests.userId, userId))
      .orderBy(desc(dataRequests.requestedAt))
      .limit(20);
  }

  async getGatewayHealth() {
    const metrics = aiGateway.getGatewayMetrics();
    const failRate = metrics.totalRequests > 0
      ? (metrics.failedRequests / metrics.totalRequests) * 100 : 0;
    const creditBlockRate = metrics.totalRequests > 0
      ? (metrics.blockedByCredits / metrics.totalRequests) * 100 : 0;
    const rateLimitBlockRate = metrics.totalRequests > 0
      ? (metrics.blockedByRateLimit / metrics.totalRequests) * 100 : 0;

    const healthStatus = failRate > 15 || creditBlockRate > 20 ? "critical"
      : failRate > 5 || creditBlockRate > 10 ? "warning" : "healthy";

    return {
      status: healthStatus,
      metrics: {
        totalRequests: metrics.totalRequests,
        failedRequests: metrics.failedRequests,
        failRate: Math.round(failRate * 10) / 10,
        blockedByCredits: metrics.blockedByCredits,
        creditBlockRate: Math.round(creditBlockRate * 10) / 10,
        blockedByRateLimit: metrics.blockedByRateLimit,
        rateLimitBlockRate: Math.round(rateLimitBlockRate * 10) / 10,
        requestsThisMinute: metrics.requestsThisMinute,
        requestsThisHour: metrics.requestsThisHour,
        totalTokensUsed: metrics.totalTokensUsed,
        totalCreditsCharged: metrics.totalCreditsCharged,
        activeChains: metrics.activeChains,
        activeDebates: metrics.activeDebates,
      },
      limits: {
        rateLimits: metrics.rateLimits,
        trainingLimits: metrics.trainingLimits,
        loopLimits: metrics.loopLimits,
        debateLimits: metrics.debateLimits,
      },
      costConfig: {
        costPerModel: metrics.costPerModel,
        actionCosts: metrics.actionCosts,
      },
    };
  }

  async getMemoryIsolationStatus() {
    let privacyData: any = { totalViolations: 0, unresolvedViolations: [], severityBreakdown: { critical: 0, high: 0, medium: 0, low: 0 }, rules: [] };
    try {
      privacyData = await privacyGatewayService.getFounderMonitoring();
    } catch {}

    const [vaultStats] = await db.select({
      totalVaults: sql<number>`COUNT(*)`,
      activeVaults: sql<number>`COUNT(*) FILTER (WHERE is_active = true)`,
      ultraPrivate: sql<number>`COUNT(*) FILTER (WHERE privacy_mode = 'ultra_private')`,
      personal: sql<number>`COUNT(*) FILTER (WHERE privacy_mode = 'personal')`,
      collaborative: sql<number>`COUNT(*) FILTER (WHERE privacy_mode = 'collaborative')`,
      open: sql<number>`COUNT(*) FILTER (WHERE privacy_mode = 'open')`,
    }).from(sql`agent_privacy_vaults`).catch(() => [{}] as any);

    return {
      vaults: {
        total: vaultStats?.totalVaults || 0,
        active: vaultStats?.activeVaults || 0,
        modeDistribution: {
          ultra_private: vaultStats?.ultraPrivate || 0,
          personal: vaultStats?.personal || 0,
          collaborative: vaultStats?.collaborative || 0,
          open: vaultStats?.open || 0,
        },
      },
      violations: {
        total: privacyData.totalViolations || 0,
        unresolved: privacyData.unresolvedViolations?.length || 0,
        severity: privacyData.severityBreakdown || {},
        recent: privacyData.recentViolations?.slice(0, 5) || [],
      },
      rules: {
        active: privacyData.activeRules || 0,
        list: privacyData.rules?.slice(0, 10) || [],
      },
    };
  }

  async getRiskTrends(days = 14) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const snapshots = await db.select().from(riskSnapshots)
      .where(gte(riskSnapshots.snapshotDate, since))
      .orderBy(riskSnapshots.snapshotDate)
      .limit(days * 2);

    return snapshots.map(s => ({
      date: s.snapshotDate,
      technical: s.technicalRisk,
      economic: s.economicRisk,
      privacy: s.privacyRisk,
      ecosystem: s.ecosystemRisk,
      legal: s.legalRisk,
      overall: s.overallRisk,
    }));
  }

  private mitigationConfig: Record<string, { enabled: boolean; threshold: number; action: string }> = {
    auto_rate_limit: { enabled: true, threshold: 80, action: "Throttle high-frequency callers" },
    credit_alerts: { enabled: true, threshold: 10, action: "Alert users with low credits" },
    privacy_lockdown: { enabled: false, threshold: 3, action: "Lock entities with 3+ critical violations" },
    spam_auto_ban: { enabled: true, threshold: 5, action: "Auto-ban after 5 spam violations" },
    data_request_sla: { enabled: true, threshold: 30, action: "Escalate unfulfilled requests after 30 days" },
  };

  getMitigationControls() {
    return Object.entries(this.mitigationConfig).map(([id, config]) => ({
      id,
      ...config,
    }));
  }

  updateMitigationControl(id: string, updates: { enabled?: boolean; threshold?: number }) {
    if (!this.mitigationConfig[id]) throw new Error("Unknown mitigation control");
    if (updates.enabled !== undefined) this.mitigationConfig[id].enabled = updates.enabled;
    if (updates.threshold !== undefined) this.mitigationConfig[id].threshold = updates.threshold;
    return { id, ...this.mitigationConfig[id] };
  }

  async getComprehensiveDashboard() {
    const [overview, gatewayHealth, memoryIsolation, trends, mitigations] = await Promise.all([
      this.getRiskOverview(),
      this.getGatewayHealth(),
      this.getMemoryIsolationStatus(),
      this.getRiskTrends(14),
      Promise.resolve(this.getMitigationControls()),
    ]);

    return {
      overview,
      gatewayHealth,
      memoryIsolation,
      trends,
      mitigations,
    };
  }
}

export const riskManagementService = new RiskManagementService();
