import { db } from "../db";
import { devOrders, users, type DevOrder } from "@shared/schema";
import { eq, desc, sql, gte, count, and } from "drizzle-orm";
import { emailService } from "./email-service";

const STAGES = ["QUEUED", "DEVELOPING", "TESTING", "DELIVERED"] as const;
type Stage = typeof STAGES[number];

const STAGE_LABELS: Record<string, string> = {
  QUEUED: "Queued — Your order is in the build queue",
  DEVELOPING: "In Development — Our team is building your app",
  TESTING: "Testing — Quality assurance in progress",
  DELIVERED: "Delivered — Your app is ready",
};

interface PricingBreakdown {
  basePrice: number;
  aiComputeEstimate: number;
  hostingEstimate: number;
  supportEstimate: number;
  totalExpenses: number;
  marginPercent: number;
  marginAmount: number;
  finalPrice: number;
}

interface BootstrapHealth {
  cashBuffer: number;
  aiCostRatio: number;
  activeBuildQueue: number;
  weeklyRevenue: number;
  dailyBuildsToday: number;
  dailyBuildLimit: number;
  reservedFunds: number;
  totalDelivered: number;
  avgDeliveryDays: number;
}

class OnDemandDevService {
  private dailyBuildLimit = 5;

  calculatePricing(description: string, requirements?: string): PricingBreakdown {
    const basePrice = 200;
    const textLength = (description?.length || 0) + (requirements?.length || 0);
    const complexity = textLength > 1000 ? "high" : textLength > 400 ? "medium" : "low";

    const aiComputeEstimate = complexity === "high" ? 40 : complexity === "medium" ? 25 : 15;
    const hostingEstimate = complexity === "high" ? 20 : 10;
    const supportEstimate = 10;

    const totalExpenses = basePrice + aiComputeEstimate + hostingEstimate + supportEstimate;
    const marginPercent = 50;
    const marginAmount = Math.round(totalExpenses * (marginPercent / 100));
    const finalPrice = totalExpenses + marginAmount;

    return { basePrice, aiComputeEstimate, hostingEstimate, supportEstimate, totalExpenses, marginPercent, marginAmount, finalPrice };
  }

  async createOrder(userId: string, data: { appName: string; appDescription: string; requirements?: string; paymentReference?: string }): Promise<DevOrder> {
    const todayCount = await this.getTodayBuildCount();
    if (todayCount >= this.dailyBuildLimit) {
      throw new Error(`Daily build limit reached (${this.dailyBuildLimit}). Try again tomorrow.`);
    }

    const pricing = this.calculatePricing(data.appDescription, data.requirements);
    const deliveryDays = pricing.finalPrice > 400 ? 5 : pricing.finalPrice > 300 ? 4 : 3;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + deliveryDays);

    const stageHistory = JSON.stringify([{ stage: "QUEUED", timestamp: new Date().toISOString(), note: "Order created" }]);

    const [order] = await db.insert(devOrders).values({
      userId,
      appName: data.appName,
      appDescription: data.appDescription,
      requirements: data.requirements || "",
      basePrice: pricing.basePrice,
      computedExpenses: pricing.totalExpenses - pricing.basePrice,
      marginPercent: pricing.marginPercent,
      finalPrice: pricing.finalPrice,
      reservedFunds: pricing.finalPrice,
      paymentStatus: data.paymentReference ? "paid" : "pending",
      paymentReference: data.paymentReference || null,
      stage: "QUEUED",
      deliveryEstimateDays: deliveryDays,
      deliveryDeadline: deadline,
      stageHistory,
    }).returning();

    this.sendStageEmail(order, "QUEUED");
    return order;
  }

  async confirmPayment(orderId: string, paymentReference: string): Promise<DevOrder | null> {
    const [order] = await db.update(devOrders)
      .set({ paymentStatus: "paid", paymentReference, updatedAt: new Date() })
      .where(eq(devOrders.id, orderId)).returning();
    return order || null;
  }

  async updateStage(orderId: string, newStage: Stage, founderNote?: string): Promise<DevOrder | null> {
    const existing = await db.select().from(devOrders).where(eq(devOrders.id, orderId)).limit(1);
    if (!existing[0]) return null;

    const history = JSON.parse(existing[0].stageHistory || "[]");
    history.push({ stage: newStage, timestamp: new Date().toISOString(), note: founderNote || `Stage updated to ${newStage}` });

    const updates: any = { stage: newStage, stageHistory: JSON.stringify(history), updatedAt: new Date() };
    if (founderNote) updates.founderNotes = founderNote;

    const [order] = await db.update(devOrders).set(updates).where(eq(devOrders.id, orderId)).returning();
    if (order) this.sendStageEmail(order, newStage);
    return order || null;
  }

  async getUserOrders(userId: string): Promise<DevOrder[]> {
    return db.select().from(devOrders).where(eq(devOrders.userId, userId)).orderBy(desc(devOrders.createdAt));
  }

  async getOrder(orderId: string): Promise<DevOrder | null> {
    const [order] = await db.select().from(devOrders).where(eq(devOrders.id, orderId));
    return order || null;
  }

  async getAllOrders(stageFilter?: string): Promise<DevOrder[]> {
    if (stageFilter) {
      return db.select().from(devOrders).where(eq(devOrders.stage, stageFilter)).orderBy(desc(devOrders.createdAt));
    }
    return db.select().from(devOrders).orderBy(desc(devOrders.createdAt));
  }

  async getBuildQueue(): Promise<DevOrder[]> {
    return db.select().from(devOrders)
      .where(sql`${devOrders.stage} IN ('QUEUED', 'DEVELOPING', 'TESTING')`)
      .orderBy(devOrders.createdAt);
  }

  async getBootstrapHealth(): Promise<BootstrapHealth> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [allOrders, weekOrders, queueOrders, deliveredOrders] = await Promise.all([
      db.select().from(devOrders),
      db.select().from(devOrders).where(and(eq(devOrders.paymentStatus, "paid"), gte(devOrders.createdAt, weekAgo))),
      db.select().from(devOrders).where(sql`${devOrders.stage} IN ('QUEUED', 'DEVELOPING', 'TESTING')`),
      db.select().from(devOrders).where(eq(devOrders.stage, "DELIVERED")),
    ]);

    const weeklyRevenue = weekOrders.reduce((sum, o) => sum + (o.finalPrice || 0), 0);
    const reservedFunds = queueOrders.reduce((sum, o) => sum + (o.reservedFunds || 0), 0);
    const totalPaid = allOrders.filter(o => o.paymentStatus === "paid").reduce((sum, o) => sum + (o.finalPrice || 0), 0);
    const totalExpenses = allOrders.reduce((sum, o) => sum + (o.computedExpenses || 0), 0);
    const aiCostRatio = totalPaid > 0 ? Math.round((totalExpenses / totalPaid) * 100) : 0;
    const cashBuffer = totalPaid - totalExpenses - reservedFunds;

    let avgDeliveryDays = 0;
    if (deliveredOrders.length > 0) {
      const totalDays = deliveredOrders.reduce((sum, o) => {
        const created = new Date(o.createdAt!).getTime();
        const updated = new Date(o.updatedAt!).getTime();
        return sum + Math.ceil((updated - created) / (24 * 60 * 60 * 1000));
      }, 0);
      avgDeliveryDays = Math.round(totalDays / deliveredOrders.length);
    }

    return {
      cashBuffer: Math.round(cashBuffer * 100) / 100,
      aiCostRatio,
      activeBuildQueue: queueOrders.length,
      weeklyRevenue: Math.round(weeklyRevenue * 100) / 100,
      dailyBuildsToday: await this.getTodayBuildCount(),
      dailyBuildLimit: this.dailyBuildLimit,
      reservedFunds: Math.round(reservedFunds * 100) / 100,
      totalDelivered: deliveredOrders.length,
      avgDeliveryDays,
    };
  }

  setDailyBuildLimit(limit: number) {
    this.dailyBuildLimit = Math.max(1, Math.min(50, limit));
    return this.dailyBuildLimit;
  }

  getDailyBuildLimit() {
    return this.dailyBuildLimit;
  }

  private async getTodayBuildCount(): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [result] = await db.select({ cnt: count() }).from(devOrders).where(gte(devOrders.createdAt, todayStart));
    return result?.cnt || 0;
  }

  private async sendStageEmail(order: DevOrder, stage: string) {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, order.userId));
      if (!user?.email) return;

      const stageMsg = STAGE_LABELS[stage] || stage;
      const deadlineStr = order.deliveryDeadline ? new Date(order.deliveryDeadline).toLocaleDateString() : "TBD";

      await emailService.sendAdminAlert(user.email, {
        title: `Build Update: ${order.appName}`,
        severity: stage === "DELIVERED" ? "info" : "low",
        message: `Your app "${order.appName}" has been updated.\n\nStatus: ${stageMsg}\nEstimated delivery: ${deadlineStr}\nOrder ID: ${order.id}`,
        actionUrl: `/my-builds`,
      });
    } catch (err) {
      console.error("[OnDemandDev] Email notification failed:", err);
    }
  }
}

export const onDemandDevService = new OnDemandDevService();
