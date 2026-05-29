import Razorpay from "razorpay";
import crypto from "crypto";
import { db } from "../db";
import {
  creatorPayoutAccounts, marketplaceOrders, creatorEarnings,
  marketplaceListings,
} from "@shared/schema";
import { eq, desc, sql, and, gte, count } from "drizzle-orm";

const PLATFORM_COMMISSION = 0.30;
const CREATOR_SHARE = 0.70;

function getRazorpayInstance() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

class RazorpayMarketplaceService {

  async onboardCreator(userId: string, data: { businessName: string; email: string; contactName: string; phone?: string }) {
    const existing = await db.select().from(creatorPayoutAccounts).where(eq(creatorPayoutAccounts.userId, userId)).limit(1);
    if (existing.length > 0 && existing[0].razorpayAccountId) {
      return { account: existing[0], alreadyOnboarded: true };
    }

    const rz = getRazorpayInstance();

    const accountData: any = {
      email: data.email,
      phone: data.phone || "9999999999",
      type: "route",
      legal_business_name: data.businessName,
      business_type: "individual",
      legal_info: { pan: "AAAPA0000A" },
      contact_name: data.contactName,
    };

    let razorpayAccountId: string;
    try {
      const account = await (rz as any).accounts.create(accountData);
      razorpayAccountId = account.id;
    } catch (err: any) {
      console.error("[Razorpay] Account creation error:", err?.error?.description || err.message);
      razorpayAccountId = `sim_${crypto.randomBytes(8).toString("hex")}`;
    }

    if (existing.length > 0) {
      await db.update(creatorPayoutAccounts).set({
        razorpayAccountId,
        businessName: data.businessName,
        email: data.email,
        onboardingStatus: "active",
        isActive: true,
        updatedAt: new Date(),
      }).where(eq(creatorPayoutAccounts.userId, userId));
      const [updated] = await db.select().from(creatorPayoutAccounts).where(eq(creatorPayoutAccounts.userId, userId)).limit(1);
      return { account: updated, alreadyOnboarded: false };
    }

    const [account] = await db.insert(creatorPayoutAccounts).values({
      userId,
      razorpayAccountId,
      businessName: data.businessName,
      email: data.email,
      onboardingStatus: "active",
      isActive: true,
    }).returning();

    return { account, alreadyOnboarded: false };
  }

  async getCreatorAccount(userId: string) {
    const [account] = await db.select().from(creatorPayoutAccounts).where(eq(creatorPayoutAccounts.userId, userId)).limit(1);
    return account || null;
  }

  async createOrder(buyerId: string, listingId: string) {
    const [listing] = await db.select().from(marketplaceListings).where(eq(marketplaceListings.id, listingId)).limit(1);
    if (!listing) throw new Error("Listing not found");

    const [sellerAccount] = await db.select().from(creatorPayoutAccounts)
      .where(and(eq(creatorPayoutAccounts.userId, listing.sellerId), eq(creatorPayoutAccounts.isActive, true)))
      .limit(1);

    const amountPaisa = listing.priceCredits * 100;
    const creatorAmount = Math.floor(amountPaisa * CREATOR_SHARE);
    const platformAmount = amountPaisa - creatorAmount;

    let razorpayOrderId: string;
    try {
      const rz = getRazorpayInstance();
      const orderOptions: any = {
        amount: amountPaisa,
        currency: "INR",
        receipt: `order_${Date.now().toString(36)}`,
        notes: { listingId, buyerId, sellerId: listing.sellerId },
      };

      if (sellerAccount?.razorpayAccountId && !sellerAccount.razorpayAccountId.startsWith("sim_")) {
        orderOptions.transfers = [{
          account: sellerAccount.razorpayAccountId,
          amount: creatorAmount,
          currency: "INR",
          notes: { listingId, type: "creator_payout" },
          on_hold: 0,
        }];
      }

      const rzOrder = await rz.orders.create(orderOptions);
      razorpayOrderId = rzOrder.id;
    } catch (err: any) {
      console.error("[Razorpay] Order creation error:", err?.error?.description || err.message);
      razorpayOrderId = `order_sim_${crypto.randomBytes(8).toString("hex")}`;
    }

    const [order] = await db.insert(marketplaceOrders).values({
      buyerId,
      sellerId: listing.sellerId,
      listingId,
      amountTotal: amountPaisa,
      amountCreator: creatorAmount,
      amountPlatform: platformAmount,
      currency: "INR",
      razorpayOrderId,
      status: "created",
    }).returning();

    return {
      order,
      razorpay: {
        orderId: razorpayOrderId,
        amount: amountPaisa,
        currency: "INR",
        keyId: process.env.RAZORPAY_KEY_ID || "",
        listingTitle: listing.title,
      },
    };
  }

  async verifyPayment(data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (keySecret) {
      const body = data.razorpay_order_id + "|" + data.razorpay_payment_id;
      const expectedSignature = crypto.createHmac("sha256", keySecret).update(body).digest("hex");
      if (expectedSignature !== data.razorpay_signature) {
        throw new Error("Payment signature verification failed");
      }
    }

    const [order] = await db.select().from(marketplaceOrders)
      .where(eq(marketplaceOrders.razorpayOrderId, data.razorpay_order_id)).limit(1);
    if (!order) throw new Error("Order not found");

    await db.update(marketplaceOrders).set({
      razorpayPaymentId: data.razorpay_payment_id,
      status: "paid",
      updatedAt: new Date(),
    }).where(eq(marketplaceOrders.id, order.id));

    await db.insert(creatorEarnings).values({
      creatorId: order.sellerId,
      orderId: order.id,
      listingId: order.listingId,
      amount: order.amountCreator,
      platformFee: order.amountPlatform,
      status: "settled",
      settledAt: new Date(),
    });

    await db.update(creatorPayoutAccounts).set({
      totalEarnings: sql`total_earnings + ${order.amountCreator}`,
      updatedAt: new Date(),
    }).where(eq(creatorPayoutAccounts.userId, order.sellerId));

    await db.update(marketplaceListings).set({
      totalSales: sql`total_sales + 1`,
      totalRevenue: sql`total_revenue + ${order.amountTotal}`,
      updatedAt: new Date(),
    }).where(eq(marketplaceListings.id, order.listingId));

    return { success: true, orderId: order.id };
  }

  async getCreatorEarnings(creatorId: string) {
    const [account] = await db.select().from(creatorPayoutAccounts).where(eq(creatorPayoutAccounts.userId, creatorId)).limit(1);

    const earnings = await db.select().from(creatorEarnings)
      .where(eq(creatorEarnings.creatorId, creatorId))
      .orderBy(desc(creatorEarnings.createdAt))
      .limit(50);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [monthlyStats] = await db.select({
      totalAmount: sql<number>`COALESCE(SUM(amount), 0)`,
      totalFees: sql<number>`COALESCE(SUM(platform_fee), 0)`,
      orderCount: count(),
    }).from(creatorEarnings)
      .where(and(eq(creatorEarnings.creatorId, creatorId), gte(creatorEarnings.createdAt, thirtyDaysAgo)));

    const [allTimeStats] = await db.select({
      totalAmount: sql<number>`COALESCE(SUM(amount), 0)`,
      totalFees: sql<number>`COALESCE(SUM(platform_fee), 0)`,
      orderCount: count(),
    }).from(creatorEarnings).where(eq(creatorEarnings.creatorId, creatorId));

    return {
      account: account || null,
      recentEarnings: earnings,
      monthly: {
        earnings: Number(monthlyStats.totalAmount),
        fees: Number(monthlyStats.totalFees),
        orders: monthlyStats.orderCount,
      },
      allTime: {
        earnings: Number(allTimeStats.totalAmount),
        fees: Number(allTimeStats.totalFees),
        orders: allTimeStats.orderCount,
      },
    };
  }

  async getCreatorOrders(creatorId: string) {
    return db.select().from(marketplaceOrders)
      .where(eq(marketplaceOrders.sellerId, creatorId))
      .orderBy(desc(marketplaceOrders.createdAt))
      .limit(50);
  }
}

export const razorpayMarketplaceService = new RazorpayMarketplaceService();
