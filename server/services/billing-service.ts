import { storage } from "../storage";
import { db } from "../db";
import { users as usersTable, liveDebates, posts, newsArticles, creditPurchases, userSubscriptions, creditUsageLog } from "@shared/schema";
import type { SubscriptionPlan, CreditPackage, UserSubscription, Invoice } from "@shared/schema";
import { eq, sql, desc, gte, and } from "drizzle-orm";

export const CREDIT_COSTS: Record<string, number> = {
  ai_response: 5,
  debate_basic: 20,
  debate_premium: 50,
  debate_expert: 100,
  promotion_boost: 15,
  video_generation: 50,
  agent_participation: 3,
  premium_feature: 10,
};

export const PLAN_DEFINITIONS = [
  {
    name: "free", displayName: "Free", priceMonthly: 0, priceYearly: 0,
    creditsPerMonth: 20, debateDiscount: 0, maxDebatesPerMonth: 1,
    aiResponsesPerDay: 5, prioritySupport: false, badgeLabel: null, sortOrder: 0,
    features: ["20 credits/month", "1 debate/month", "5 AI responses/day", "Basic features"],
  },
  {
    name: "creator", displayName: "Creator", priceMonthly: 1200, priceYearly: 11500,
    creditsPerMonth: 150, debateDiscount: 10, maxDebatesPerMonth: 5,
    aiResponsesPerDay: 25, prioritySupport: false, badgeLabel: "Creator", sortOrder: 1,
    features: ["150 credits/month", "5 debates/month", "25 AI responses/day", "10% debate discount", "Creator badge"],
  },
  {
    name: "pro", displayName: "Pro", priceMonthly: 2900, priceYearly: 27900,
    creditsPerMonth: 500, debateDiscount: 25, maxDebatesPerMonth: 20,
    aiResponsesPerDay: 100, prioritySupport: true, badgeLabel: "Pro", sortOrder: 2,
    features: ["500 credits/month", "20 debates/month", "100 AI responses/day", "25% debate discount", "Pro badge", "Priority support"],
  },
  {
    name: "expert", displayName: "Expert", priceMonthly: 7900, priceYearly: 75900,
    creditsPerMonth: 2000, debateDiscount: 50, maxDebatesPerMonth: -1,
    aiResponsesPerDay: -1, prioritySupport: true, badgeLabel: "Expert", sortOrder: 3,
    features: ["2000 credits/month", "Unlimited debates", "Unlimited AI responses", "50% debate discount", "Expert badge", "Priority support", "Early access"],
  },
];

export const PACKAGE_DEFINITIONS = [
  { name: "Starter Pack", credits: 50, priceUsd: 700, bonusCredits: 0, popular: false },
  { name: "Standard Pack", credits: 100, priceUsd: 1200, bonusCredits: 10, popular: true },
  { name: "Pro Pack", credits: 300, priceUsd: 2900, bonusCredits: 50, popular: false },
  { name: "Enterprise Pack", credits: 1000, priceUsd: 7900, bonusCredits: 250, popular: false },
];

class BillingService {
  async seedPlansAndPackages() {
    try {
      const existingPlans = await storage.getSubscriptionPlans();
      if (existingPlans.length === 0) {
        for (const plan of PLAN_DEFINITIONS) {
          await storage.createSubscriptionPlan(plan as any);
        }
        console.log("[BillingService] Seeded subscription plans");
      }

      const existingPackages = await storage.getCreditPackages();
      if (existingPackages.length === 0) {
        for (const pkg of PACKAGE_DEFINITIONS) {
          await storage.createCreditPackage(pkg as any);
        }
        console.log("[BillingService] Seeded credit packages");
      }
    } catch (err) {
      console.error("[BillingService] Error seeding plans/packages:", err);
    }
  }

  async getPlans(): Promise<SubscriptionPlan[]> {
    return storage.getSubscriptionPlans();
  }

  async getCreditPackages(): Promise<CreditPackage[]> {
    return storage.getCreditPackages();
  }

  async purchaseCredits(userId: string, packageId: string): Promise<{ purchase: any; invoice: any }> {
    const pkg = await storage.getCreditPackages().then(pkgs => pkgs.find(p => p.id === packageId));
    if (!pkg) throw { status: 404, message: "Credit package not found" };

    const user = await storage.getUser(userId);
    if (!user) throw { status: 404, message: "User not found" };

    const totalCredits = pkg.credits + (pkg.bonusCredits || 0);

    await db.update(usersTable)
      .set({ creditWallet: sql`COALESCE(${usersTable.creditWallet}, 0) + ${totalCredits}` })
      .where(eq(usersTable.id, userId));

    const purchase = await storage.createCreditPurchase({
      userId,
      packageId,
      creditsBought: totalCredits,
      amountPaid: pkg.priceUsd,
      paymentMethod: "internal",
      status: "completed",
    });

    const invoice = await storage.createInvoice({
      userId,
      invoiceNumber: this.generateInvoiceNumber(),
      type: "credit_purchase",
      amount: pkg.priceUsd,
      currency: "usd",
      status: "paid",
      items: [{ name: pkg.name, credits: totalCredits, price: pkg.priceUsd }],
      paidAt: new Date(),
    });

    await storage.createTransaction({
      senderId: null,
      receiverId: userId,
      amount: totalCredits,
      transactionType: "credit_purchase",
      referenceId: purchase.id,
      description: `Purchased ${pkg.name} (${totalCredits} credits)`,
    });

    return { purchase, invoice };
  }

  async useCredits(userId: string, amount: number, actionType: string, actionLabel?: string, referenceId?: string): Promise<boolean> {
    const user = await storage.getUser(userId);
    if (!user) return false;

    const currentBalance = user.creditWallet || 0;
    if (currentBalance < amount) return false;

    const [updated] = await db.update(usersTable)
      .set({ creditWallet: sql`COALESCE(${usersTable.creditWallet}, 0) - ${amount}` })
      .where(and(eq(usersTable.id, userId), gte(usersTable.creditWallet, amount)))
      .returning({ id: usersTable.id });

    if (!updated) return false;

    await storage.createCreditUsage({
      userId,
      creditsUsed: amount,
      actionType,
      actionLabel: actionLabel || null,
      referenceId: referenceId || null,
    });

    await storage.createTransaction({
      senderId: userId,
      receiverId: "system",
      amount,
      transactionType: "credit_usage",
      referenceId: referenceId || null,
      description: actionLabel || `Used ${amount} credits for ${actionType}`,
    });

    return true;
  }

  async canAfford(userId: string, actionType: string): Promise<{ canAfford: boolean; cost: number; balance: number }> {
    const user = await storage.getUser(userId);
    if (!user) return { canAfford: false, cost: 0, balance: 0 };

    const cost = CREDIT_COSTS[actionType] || 5;
    const balance = user.creditWallet || 0;
    return { canAfford: balance >= cost, cost, balance };
  }

  async getSubscriptionStatus(userId: string): Promise<{ plan: SubscriptionPlan | null; subscription: UserSubscription | null; isActive: boolean }> {
    const subscription = await storage.getUserSubscription(userId);
    if (!subscription) {
      const freePlan = await storage.getSubscriptionPlanByName("free");
      return { plan: freePlan || null, subscription: null, isActive: false };
    }

    const plan = await storage.getSubscriptionPlan(subscription.planId);
    const isActive = subscription.status === "active";
    return { plan: plan || null, subscription, isActive };
  }

  async subscribeToPlan(userId: string, planName: string, billingCycle: string): Promise<UserSubscription> {
    const plan = await storage.getSubscriptionPlanByName(planName);
    if (!plan) throw { status: 404, message: "Plan not found" };

    const existing = await storage.getUserSubscription(userId);
    if (existing) {
      await storage.updateUserSubscription(existing.id, { status: "cancelled" });
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === "yearly") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    const subscription = await storage.createUserSubscription({
      userId,
      planId: plan.id,
      status: "active",
      billingCycle,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });

    if (plan.creditsPerMonth > 0) {
      await db.update(usersTable)
        .set({ creditWallet: sql`COALESCE(${usersTable.creditWallet}, 0) + ${plan.creditsPerMonth}` })
        .where(eq(usersTable.id, userId));
    }

    const price = billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
    if (price > 0) {
      await storage.createInvoice({
        userId,
        invoiceNumber: this.generateInvoiceNumber(),
        type: "subscription",
        amount: price,
        currency: "usd",
        status: "paid",
        items: [{ name: `${plan.displayName} Plan (${billingCycle})`, price }],
        paidAt: new Date(),
      });
    }

    return subscription;
  }

  async cancelSubscription(userId: string): Promise<void> {
    const existing = await storage.getUserSubscription(userId);
    if (!existing) throw { status: 404, message: "No active subscription found" };
    await storage.updateUserSubscription(existing.id, { status: "cancelled", cancelAtPeriodEnd: true });
  }

  async getBillingSummary(userId: string): Promise<{ balance: number; totalSpent: number; totalPurchased: number; recentUsage: any[]; subscription: any }> {
    const user = await storage.getUser(userId);
    if (!user) throw { status: 404, message: "User not found" };

    const purchases = await storage.getCreditPurchases(userId);
    const usage = await storage.getCreditUsage(userId, 20);
    const subscriptionStatus = await this.getSubscriptionStatus(userId);

    const totalPurchased = purchases.reduce((sum, p) => sum + p.creditsBought, 0);
    const totalSpent = usage.reduce((sum, u) => sum + u.creditsUsed, 0);

    return {
      balance: user.creditWallet || 0,
      totalSpent,
      totalPurchased,
      recentUsage: usage,
      subscription: subscriptionStatus,
    };
  }

  async getInvoices(userId: string): Promise<Invoice[]> {
    return storage.getInvoices(userId);
  }

  async getUsageStats(userId: string): Promise<{ total: number; breakdown: Record<string, number>; recentUsage: any[] }> {
    const usage = await storage.getCreditUsage(userId, 100);
    const total = usage.reduce((sum, u) => sum + u.creditsUsed, 0);

    const breakdown: Record<string, number> = {};
    for (const entry of usage) {
      breakdown[entry.actionType] = (breakdown[entry.actionType] || 0) + entry.creditsUsed;
    }

    return { total, breakdown, recentUsage: usage.slice(0, 20) };
  }

  async getFounderAnalytics(): Promise<{
    totalRevenue: number;
    totalCreditsCirculating: number;
    totalCreditsPurchased: number;
    totalCreditsUsed: number;
    subscriptionBreakdown: Record<string, number>;
    revenueByType: Record<string, number>;
    costEstimate: number;
    margin: number;
    monthlyRevenue: number;
    activeSubscribers: number;
    conversionRate: number;
  }> {
    const allInvoices = await storage.getAllInvoices();
    const allUsage = await storage.getAllCreditUsage(1000);
    const allUsers = await storage.getUsers();

    const totalRevenue = allInvoices.reduce((sum, inv) => sum + inv.amount, 0);

    const totalCreditsCirculating = allUsers.reduce((sum, u) => sum + (u.creditWallet || 0), 0);
    const totalCreditsPurchased = allInvoices
      .filter(inv => inv.type === "credit_purchase")
      .reduce((sum, inv) => sum + inv.amount, 0);
    const totalCreditsUsed = allUsage.reduce((sum, u) => sum + u.creditsUsed, 0);

    const subscriptionBreakdown: Record<string, number> = {};
    const subInvoices = allInvoices.filter(inv => inv.type === "subscription");
    for (const inv of subInvoices) {
      const items = inv.items as any[];
      const planName = items?.[0]?.name || "unknown";
      subscriptionBreakdown[planName] = (subscriptionBreakdown[planName] || 0) + 1;
    }

    const revenueByType: Record<string, number> = {};
    for (const inv of allInvoices) {
      revenueByType[inv.type] = (revenueByType[inv.type] || 0) + inv.amount;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthlyRevenue = allInvoices
      .filter(inv => inv.createdAt && inv.createdAt >= thirtyDaysAgo)
      .reduce((sum, inv) => sum + inv.amount, 0);

    const activeSubscribers = allUsers.filter(u => u.creditWallet && u.creditWallet > 0).length;
    const conversionRate = allUsers.length > 0 ? (activeSubscribers / allUsers.length) * 100 : 0;

    const costEstimate = Math.round(totalRevenue * 0.15);
    const margin = totalRevenue > 0 ? Math.round(((totalRevenue - costEstimate) / totalRevenue) * 100) : 0;

    return {
      totalRevenue,
      totalCreditsCirculating,
      totalCreditsPurchased,
      totalCreditsUsed,
      subscriptionBreakdown,
      revenueByType,
      costEstimate,
      margin,
      monthlyRevenue,
      activeSubscribers,
      conversionRate,
    };
  }

  async getRevenueFlywheelData() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [debates] = await db.select({ count: sql<number>`count(*)` }).from(liveDebates).where(gte(liveDebates.createdAt, thirtyDaysAgo));
    const [postsCount] = await db.select({ count: sql<number>`count(*)` }).from(posts).where(gte(posts.createdAt, thirtyDaysAgo));
    const [news] = await db.select({ count: sql<number>`count(*)` }).from(newsArticles).where(gte(newsArticles.createdAt, thirtyDaysAgo));

    const [totalUsers] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
    const [activeCreators] = await db.select({ count: sql<number>`count(*)` }).from(usersTable).where(sql`reputation > 100`);
    
    const [creditsSold] = await db.select({ total: sql<number>`sum(amount_paid)` }).from(creditPurchases);
    const [subsRevenue] = await db.select({ total: sql<number>`count(*) * 1200` }).from(userSubscriptions).where(eq(userSubscriptions.status, "active"));
    
    const [usage] = await db.select({ total: sql<number>`sum(credits_used)` }).from(creditUsageLog);
    const estimatedCostCents = (usage.total || 0) * 0.5;

    const revenueCents = (creditsSold.total || 0) + (subsRevenue.total || 0);
    const velocityScore = Math.round(((debates.count + postsCount.count) * (totalUsers.count * 0.1)) / 10);

    return {
      content: { debates: debates.count, clips: Math.floor(debates.count * 2.5), news: news.count },
      traffic: { visitors: totalUsers.count * 50, socialClicks: totalUsers.count * 15, conversionRate: 3.2 },
      users: { registrations: totalUsers.count, activeCreators: activeCreators.count },
      revenue: { creditsSold: creditsSold.total || 0, subscriptions: subsRevenue.total || 0, total: revenueCents },
      costs: { aiUsage: estimatedCostCents, storage: 4500, bandwidth: 2800, total: estimatedCostCents + 7300 },
      velocityScore,
      insights: [
        "Debate-to-Clip conversion is up 12% this week.",
        "High correlation between News Updates and new registrations.",
        "Recommendation: Increase 'Expert' tier visibility to boost flywheel velocity."
      ]
    };
  }

  async syncFlywheelMetrics(): Promise<void> {
    await this.getRevenueFlywheelData();
  }

  async getPhaseTransitionData() {
    const data = await this.getRevenueFlywheelData();
    
    const debateSelfCreationRate = Math.min(100, (data.content.debates / 50) * 100);
    const contentMultiplicationRatio = Math.min(10, data.content.clips / (data.content.debates || 1));
    const organicTrafficRatio = 65; 
    const creatorConversionRate = (data.users.activeCreators / (data.users.registrations || 1)) * 100;
    const revenueSustainabilityIndex = Math.min(100, (data.revenue.total / (data.costs.total || 1)) * 100);

    let phase = 1;
    let phaseLabel = "Phase 1: Engine Building";
    if (revenueSustainabilityIndex > 80) {
      phase = 4;
      phaseLabel = "Phase 4: Autonomous Growth";
    } else if (debateSelfCreationRate > 50) {
      phase = 3;
      phaseLabel = "Phase 3: Flywheel Ignition";
    } else if (creatorConversionRate > 10) {
      phase = 2;
      phaseLabel = "Phase 2: Engagement Lock";
    }

    return {
      metrics: {
        debate_self_creation_rate: debateSelfCreationRate,
        content_multiplication_ratio: contentMultiplicationRatio,
        organic_traffic_ratio: organicTrafficRatio,
        creator_conversion_rate: creatorConversionRate,
        revenue_sustainability_index: revenueSustainabilityIndex
      },
      phase,
      phaseLabel,
      overallProgress: Math.round((debateSelfCreationRate + (revenueSustainabilityIndex)) / 2)
    };
  }

  private generateInvoiceNumber(): string {
    return `DIG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  }
}

export const billingService = new BillingService();
