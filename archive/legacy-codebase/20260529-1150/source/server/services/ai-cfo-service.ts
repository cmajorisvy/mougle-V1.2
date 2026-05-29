import { db } from "../db";
import {
  users, userSubscriptions, subscriptionPlans, creditPurchases, creditUsageLog,
  invoices, marketplaceOrders, creatorEarnings, creatorPayoutAccounts,
  marketplaceListings, labsApps, pricingAnalyses
} from "@shared/schema";
import { eq, sql, desc, and, gte } from "drizzle-orm";

interface RevenueMetrics {
  totalSubscriptionRevenue: number;
  totalCreditRevenue: number;
  totalMarketplaceRevenue: number;
  totalPlatformRevenue: number;
  monthlyRecurringRevenue: number;
  averageRevenuePerUser: number;
}

interface CostMetrics {
  estimatedAiComputeCost: number;
  estimatedHostingCost: number;
  estimatedBandwidthCost: number;
  estimatedSupportCost: number;
  totalOperationalCost: number;
}

interface HealthIndicators {
  grossMargin: number;
  netMargin: number;
  burnRate: number;
  runway: string;
  ltv: number;
  cac: number;
  ltvCacRatio: number;
}

interface Recommendation {
  id: string;
  type: "pricing" | "profitability" | "promotion" | "retention" | "cost";
  severity: "info" | "warning" | "critical" | "opportunity";
  title: string;
  description: string;
  impact: string;
  action: string;
  estimatedGain: number;
}

interface Forecast {
  month: string;
  revenue: number;
  costs: number;
  profit: number;
  users: number;
}

const thirtyDaysAgo = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const sevenDaysAgo = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

export const aiCfoService = {
  async getFounderDashboard() {
    const [revenueMetrics, costMetrics, userMetrics, recommendations, forecasts, alerts] = await Promise.all([
      this.getRevenueMetrics(),
      this.getCostMetrics(),
      this.getUserMetrics(),
      this.generateRecommendations(),
      this.generateForecasts(),
      this.generateAlerts(),
    ]);

    const health = this.calculateHealth(revenueMetrics, costMetrics, userMetrics);

    return {
      revenue: revenueMetrics,
      costs: costMetrics,
      users: userMetrics,
      health,
      recommendations,
      forecasts,
      alerts,
      lastUpdated: new Date().toISOString(),
      mode: "recommendation_only",
    };
  },

  async getCreatorDashboard(creatorId: string) {
    const [earnings, listings, apps, payoutAccount, recommendations] = await Promise.all([
      this.getCreatorEarnings(creatorId),
      this.getCreatorListings(creatorId),
      this.getCreatorApps(creatorId),
      this.getCreatorPayoutAccount(creatorId),
      this.generateCreatorRecommendations(creatorId),
    ]);

    const forecast = this.generateCreatorForecast(earnings);

    return {
      earnings,
      listings,
      apps,
      payoutAccount,
      recommendations,
      forecast,
      lastUpdated: new Date().toISOString(),
    };
  },

  async getRevenueMetrics(): Promise<RevenueMetrics> {
    const [subResult] = await db.select({
      count: sql<number>`count(*)`,
    }).from(userSubscriptions).where(eq(userSubscriptions.status, "active"));

    const [avgPlanResult] = await db.select({
      avg: sql<number>`coalesce(avg(${subscriptionPlans.priceMonthly}), 0)`,
    }).from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));

    const [creditResult] = await db.select({
      total: sql<number>`coalesce(sum(${creditPurchases.amountPaid}), 0)`,
    }).from(creditPurchases).where(eq(creditPurchases.status, "completed"));

    const [invoiceResult] = await db.select({
      total: sql<number>`coalesce(sum(${invoices.amount}), 0)`,
    }).from(invoices).where(eq(invoices.status, "paid"));

    const [marketplaceResult] = await db.select({
      total: sql<number>`coalesce(sum(${marketplaceOrders.amountPlatform}), 0)`,
      volume: sql<number>`coalesce(sum(${marketplaceOrders.amountTotal}), 0)`,
    }).from(marketplaceOrders).where(eq(marketplaceOrders.status, "completed"));

    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);

    const activeSubscriptions = Number(subResult?.count || 0);
    const avgPlanPrice = Number(avgPlanResult?.avg || 0);
    const subscriptionRevenue = activeSubscriptions * avgPlanPrice;
    const creditRevenue = Number(creditResult?.total || 0);
    const invoiceRevenue = Number(invoiceResult?.total || 0);
    const marketplaceRevenue = Number(marketplaceResult?.total || 0);
    const totalUsers = Math.max(Number(userCount?.count || 1), 1);
    const totalPlatformRevenue = Math.max(subscriptionRevenue, invoiceRevenue) + creditRevenue + marketplaceRevenue;

    return {
      totalSubscriptionRevenue: subscriptionRevenue,
      totalCreditRevenue: creditRevenue,
      totalMarketplaceRevenue: marketplaceRevenue,
      totalPlatformRevenue,
      monthlyRecurringRevenue: subscriptionRevenue,
      averageRevenuePerUser: Math.round(totalPlatformRevenue / totalUsers),
    };
  },

  async getCostMetrics(): Promise<CostMetrics> {
    const [usageResult] = await db.select({
      totalCredits: sql<number>`coalesce(sum(${creditUsageLog.creditsUsed}), 0)`,
    }).from(creditUsageLog);

    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const totalUsers = Math.max(Number(userCount?.count || 1), 1);

    const totalCreditsUsed = Number(usageResult?.totalCredits || 0);
    const aiComputeCost = Math.round(totalCreditsUsed * 0.02);
    const hostingCostPerUser = 50;
    const bandwidthCostPerUser = 15;
    const supportCostPerUser = 20;
    const hostingCost = Math.round(hostingCostPerUser * totalUsers);
    const bandwidthCost = Math.round(bandwidthCostPerUser * totalUsers);
    const supportCost = Math.round(supportCostPerUser * totalUsers);

    return {
      estimatedAiComputeCost: aiComputeCost,
      estimatedHostingCost: hostingCost,
      estimatedBandwidthCost: bandwidthCost,
      estimatedSupportCost: supportCost,
      totalOperationalCost: aiComputeCost + hostingCost + bandwidthCost + supportCost,
    };
  },

  async getUserMetrics() {
    const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [recentResult] = await db.select({ count: sql<number>`count(*)` })
      .from(users).where(gte(users.createdAt, thirtyDaysAgo()));
    const [weekResult] = await db.select({ count: sql<number>`count(*)` })
      .from(users).where(gte(users.createdAt, sevenDaysAgo()));
    const [activeSubsResult] = await db.select({ count: sql<number>`count(*)` })
      .from(userSubscriptions).where(eq(userSubscriptions.status, "active"));

    const total = Number(totalResult?.count || 0);
    const newThisMonth = Number(recentResult?.count || 0);
    const newThisWeek = Number(weekResult?.count || 0);
    const activeSubs = Number(activeSubsResult?.count || 0);

    const [cancelledResult] = await db.select({ count: sql<number>`count(*)` })
      .from(userSubscriptions).where(
        and(eq(userSubscriptions.status, "cancelled"), gte(userSubscriptions.updatedAt, thirtyDaysAgo()))
      );
    const cancelledThisMonth = Number(cancelledResult?.count || 0);

    const conversionRate = total > 0 ? Math.round((activeSubs / total) * 100 * 10) / 10 : 0;
    const churnRate = activeSubs > 0
      ? Math.round((cancelledThisMonth / (activeSubs + cancelledThisMonth)) * 100 * 10) / 10
      : 0;
    const retentionRate = Math.round((100 - churnRate) * 10) / 10;

    return {
      totalUsers: total,
      newUsersThisMonth: newThisMonth,
      newUsersThisWeek: newThisWeek,
      activeSubscribers: activeSubs,
      conversionRate,
      churnRate,
      retentionRate,
    };
  },

  calculateHealth(revenue: RevenueMetrics, costs: CostMetrics, userMetrics: any): HealthIndicators {
    const grossRevenue = revenue.totalPlatformRevenue;
    const totalCost = costs.totalOperationalCost;
    const grossProfit = grossRevenue - totalCost;

    const grossMargin = grossRevenue > 0 ? Math.round((grossProfit / grossRevenue) * 100 * 10) / 10 : 0;
    const netMargin = grossRevenue > 0 ? Math.round(((grossProfit * 0.8) / grossRevenue) * 100 * 10) / 10 : 0;

    const burnRate = totalCost;
    const cashReserves = 500000;
    const monthsRunway = burnRate > 0 ? Math.floor(cashReserves / burnRate) : 999;
    const runway = monthsRunway > 24 ? "24+ months" : `${monthsRunway} months`;

    const ltv = revenue.averageRevenuePerUser * 12;
    const cac = userMetrics.newUsersThisMonth > 0
      ? Math.round(totalCost * 0.3 / userMetrics.newUsersThisMonth)
      : 500;
    const ltvCacRatio = cac > 0 ? Math.round((ltv / cac) * 10) / 10 : 0;

    return { grossMargin, netMargin, burnRate, runway, ltv, cac, ltvCacRatio };
  },

  async generateRecommendations(): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const userMetrics = await this.getUserMetrics();
    const revenue = await this.getRevenueMetrics();

    if (userMetrics.conversionRate < 5) {
      recommendations.push({
        id: "low_conversion",
        type: "pricing",
        severity: "warning",
        title: "Low free-to-paid conversion rate",
        description: `Only ${userMetrics.conversionRate}% of users convert to paid plans. Industry benchmark is 5-10%.`,
        impact: "Increasing conversion by 2% could add ₹${Math.round(userMetrics.totalUsers * 0.02 * 499)} MRR.",
        action: "Consider adding a trial period, improving onboarding, or adjusting pricing tiers.",
        estimatedGain: Math.round(userMetrics.totalUsers * 0.02 * 499),
      });
    }

    if (userMetrics.churnRate > 5) {
      recommendations.push({
        id: "high_churn",
        type: "retention",
        severity: "warning",
        title: "Churn rate above target",
        description: `Monthly churn is ${userMetrics.churnRate}%. Target is below 5% for SaaS platforms.`,
        impact: "Reducing churn by 1% retains ₹${Math.round(userMetrics.activeSubscribers * 0.01 * 499)} monthly revenue.",
        action: "Implement win-back campaigns, improve engagement features, and add exit surveys.",
        estimatedGain: Math.round(userMetrics.activeSubscribers * 0.01 * 499),
      });
    }

    if (revenue.totalMarketplaceRevenue === 0) {
      recommendations.push({
        id: "marketplace_activation",
        type: "promotion",
        severity: "opportunity",
        title: "Marketplace revenue untapped",
        description: "No marketplace transactions yet. The 70/30 creator/platform split can generate passive income.",
        impact: "Even 10 transactions/month at ₹500 avg generates ₹1,500 platform revenue.",
        action: "Promote marketplace to creators, feature top listings, and offer launch incentives.",
        estimatedGain: 1500,
      });
    }

    recommendations.push({
      id: "credit_upsell",
      type: "profitability",
      severity: "info",
      title: "Credit package optimization",
      description: "Analyze credit usage patterns to create targeted upsell packages for power users.",
      impact: "Power users who buy credits 3x are 85% more likely to subscribe.",
      action: "Identify top credit consumers and offer them discounted annual plans.",
      estimatedGain: Math.round(userMetrics.totalUsers * 0.05 * 499),
    });

    recommendations.push({
      id: "labs_monetization",
      type: "pricing",
      severity: "opportunity",
      title: "Labs app pricing optimization",
      description: "Use the Intelligent Pricing Engine data to recommend price adjustments for underpriced apps.",
      impact: "Properly priced apps generate 40% more sustainable revenue.",
      action: "Review apps priced below the pricing engine minimum and suggest increases.",
      estimatedGain: 5000,
    });

    return recommendations;
  },

  async generateAlerts() {
    const alerts: Array<{ type: string; severity: string; message: string; timestamp: string }> = [];

    const costs = await this.getCostMetrics();
    const revenue = await this.getRevenueMetrics();

    if (costs.totalOperationalCost > revenue.totalPlatformRevenue * 0.8) {
      alerts.push({
        type: "profitability",
        severity: "critical",
        message: "Operational costs are above 80% of revenue. Immediate optimization needed.",
        timestamp: new Date().toISOString(),
      });
    }

    if (revenue.monthlyRecurringRevenue === 0) {
      alerts.push({
        type: "revenue",
        severity: "warning",
        message: "No active subscriptions generating MRR. Focus on conversion.",
        timestamp: new Date().toISOString(),
      });
    }

    if (costs.estimatedAiComputeCost > costs.totalOperationalCost * 0.5) {
      alerts.push({
        type: "cost",
        severity: "warning",
        message: "AI compute costs exceed 50% of total operational costs. Consider usage optimization.",
        timestamp: new Date().toISOString(),
      });
    }

    return alerts;
  },

  async generateForecasts(): Promise<Forecast[]> {
    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const totalUsers = Math.max(Number(userCount?.count || 1), 1);
    const revenue = await this.getRevenueMetrics();
    const costs = await this.getCostMetrics();

    const now = new Date();
    const forecasts: Forecast[] = [];
    const baseRevenue = Math.max(revenue.totalPlatformRevenue, totalUsers * 50);
    const baseCosts = Math.max(costs.totalOperationalCost, totalUsers * 30);
    const baseUsers = totalUsers;
    const growthRate = 0.15;

    for (let i = 0; i < 6; i++) {
      const month = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthLabel = month.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      const multiplier = Math.pow(1 + growthRate, i);

      const revenue = Math.round(baseRevenue * multiplier);
      const costs = Math.round(baseCosts * (1 + i * 0.08));
      const users = Math.round(baseUsers * multiplier);

      forecasts.push({
        month: monthLabel,
        revenue,
        costs,
        profit: revenue - costs,
        users,
      });
    }

    return forecasts;
  },

  async getCreatorEarnings(creatorId: string) {
    const earnings = await db.select().from(creatorEarnings)
      .where(eq(creatorEarnings.creatorId, creatorId))
      .orderBy(desc(creatorEarnings.createdAt));

    const totalEarned = earnings.reduce((sum, e) => sum + e.amount, 0);
    const totalFees = earnings.reduce((sum, e) => sum + e.platformFee, 0);
    const pendingEarnings = earnings.filter(e => e.status === "pending").reduce((sum, e) => sum + e.amount, 0);
    const settledEarnings = earnings.filter(e => e.status === "settled").reduce((sum, e) => sum + e.amount, 0);

    return {
      totalEarned,
      totalFees,
      netEarnings: totalEarned - totalFees,
      pendingEarnings,
      settledEarnings,
      transactionCount: earnings.length,
      recentTransactions: earnings.slice(0, 10),
      averageOrderValue: earnings.length > 0 ? Math.round(totalEarned / earnings.length) : 0,
    };
  },

  async getCreatorListings(creatorId: string) {
    const listings = await db.select().from(marketplaceListings)
      .where(eq(marketplaceListings.sellerId, creatorId));

    const totalSales = listings.reduce((sum, l) => sum + l.totalSales, 0);
    const totalRevenue = listings.reduce((sum, l) => sum + l.totalRevenue, 0);
    const avgRating = listings.length > 0
      ? Math.round(listings.reduce((sum, l) => sum + (l.averageRating || 0), 0) / listings.length * 10) / 10
      : 0;

    return {
      totalListings: listings.length,
      activeListings: listings.filter(l => l.status === "active").length,
      totalSales,
      totalRevenue,
      averageRating: avgRating,
      listings: listings.map(l => ({
        id: l.id,
        title: l.title,
        pricingModel: l.pricingModel,
        priceCredits: l.priceCredits,
        totalSales: l.totalSales,
        totalRevenue: l.totalRevenue,
        averageRating: l.averageRating,
        status: l.status,
      })),
    };
  },

  async getCreatorApps(creatorId: string) {
    const apps = await db.select().from(labsApps)
      .where(eq(labsApps.creatorId, creatorId));

    return {
      totalApps: apps.length,
      publishedApps: apps.filter(a => a.status === "published").length,
      totalInstalls: apps.reduce((sum, a) => sum + a.installCount, 0),
      averageRating: apps.length > 0
        ? Math.round(apps.reduce((sum, a) => sum + (a.rating || 0), 0) / apps.length * 10) / 10
        : 0,
      apps: apps.map(a => ({
        id: a.id,
        name: a.name,
        category: a.category,
        pricingModel: a.pricingModel,
        price: a.price,
        installCount: a.installCount,
        rating: a.rating,
        status: a.status,
      })),
    };
  },

  async getCreatorPayoutAccount(creatorId: string) {
    const [account] = await db.select().from(creatorPayoutAccounts)
      .where(eq(creatorPayoutAccounts.userId, creatorId));

    if (!account) {
      return {
        exists: false,
        onboardingStatus: "not_started",
        totalEarnings: 0,
        totalWithdrawn: 0,
        pendingAmount: 0,
        isActive: false,
      };
    }

    return {
      exists: true,
      onboardingStatus: account.onboardingStatus,
      totalEarnings: account.totalEarnings,
      totalWithdrawn: account.totalWithdrawn,
      pendingAmount: account.pendingAmount,
      isActive: account.isActive,
    };
  },

  async generateCreatorRecommendations(creatorId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const [earnings, listings, apps] = await Promise.all([
      this.getCreatorEarnings(creatorId),
      this.getCreatorListings(creatorId),
      this.getCreatorApps(creatorId),
    ]);

    if (listings.totalListings === 0 && apps.totalApps === 0) {
      recommendations.push({
        id: "start_selling",
        type: "promotion",
        severity: "opportunity",
        title: "Start selling on the marketplace",
        description: "You haven't listed any agents or apps yet. Creators earn 70% of each sale.",
        impact: "Top creators earn ₹10,000+ monthly from marketplace sales.",
        action: "Create an agent or Labs app and list it on the marketplace.",
        estimatedGain: 3000,
      });
    }

    if (listings.totalListings > 0 && listings.totalSales === 0) {
      recommendations.push({
        id: "first_sale",
        type: "promotion",
        severity: "info",
        title: "Get your first sale",
        description: "You have listings but no sales yet. Optimize your listing descriptions and pricing.",
        impact: "Well-optimized listings convert 3-5x better than basic ones.",
        action: "Add detailed descriptions, screenshots, and competitive pricing to your listings.",
        estimatedGain: 500,
      });
    }

    if (listings.averageRating > 0 && listings.averageRating < 4.0) {
      recommendations.push({
        id: "improve_quality",
        type: "profitability",
        severity: "warning",
        title: "Improve listing quality",
        description: `Your average rating is ${listings.averageRating}/5. Listings rated 4.5+ earn 60% more.`,
        impact: "Higher ratings lead to more visibility and sales.",
        action: "Respond to reviews, fix reported issues, and add more features.",
        estimatedGain: Math.round(listings.totalRevenue * 0.3),
      });
    }

    if (apps.totalApps > 0 && apps.publishedApps === 0) {
      recommendations.push({
        id: "publish_apps",
        type: "pricing",
        severity: "info",
        title: "Publish your Labs apps",
        description: `You have ${apps.totalApps} app(s) in draft. Publishing them opens revenue streams.`,
        impact: "Published apps earn from installs and subscriptions.",
        action: "Complete your app details and submit for publishing.",
        estimatedGain: 2000,
      });
    }

    recommendations.push({
      id: "pricing_optimization",
      type: "pricing",
      severity: "info",
      title: "Use the Pricing Engine",
      description: "Run your apps through the Intelligent Pricing Engine to find the optimal price point.",
      impact: "Data-driven pricing increases revenue by 20-40% on average.",
      action: "Go to the Pricing Engine and analyze your app descriptions.",
      estimatedGain: Math.round(earnings.totalEarned * 0.2) || 1000,
    });

    return recommendations;
  },

  generateCreatorForecast(earnings: any) {
    const now = new Date();
    const monthlyRate = earnings.transactionCount > 0 ? earnings.averageOrderValue * 2 : 0;
    const forecasts: Forecast[] = [];

    for (let i = 0; i < 6; i++) {
      const month = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthLabel = month.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      const growth = Math.pow(1.1, i);

      forecasts.push({
        month: monthLabel,
        revenue: Math.round(monthlyRate * growth) || Math.round(1000 * growth),
        costs: Math.round(200 * (1 + i * 0.05)),
        profit: Math.round((monthlyRate * growth) || (1000 * growth)) - Math.round(200 * (1 + i * 0.05)),
        users: Math.round(10 * growth),
      });
    }

    return forecasts;
  },
};
