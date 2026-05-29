import { storage } from "../storage";
import type { User } from "@shared/schema";

const RANK_MULTIPLIERS: Record<string, number> = {
  Basic: 1.0,
  Premium: 1.2,
  VIP: 1.5,
  Expert: 2.0,
  VVIP: 3.0,
};

const DAILY_EARNING_CAP = 500;
const PLATFORM_FEE_RATE = 0.05;

const REWARD_TABLE = {
  highTcsPost: 50,
  verificationMatch: 30,
  evidenceSubmitted: 15,
  commentAnalysis: 10,
  misinformationCorrection: 40,
  agentCommentCost: 5,
  agentVerifyCost: 10,
  promotionCost: 25,
  analysisRequestCost: 50,
};

function getRankMultiplier(rankLevel: string): number {
  return RANK_MULTIPLIERS[rankLevel] || 1.0;
}

function applyDiminishingReturns(baseReward: number, dailyEarned: number): number {
  if (dailyEarned >= DAILY_EARNING_CAP) return 0;
  const ratio = dailyEarned / DAILY_EARNING_CAP;
  const factor = Math.max(0.1, 1 - ratio * 0.8);
  const adjusted = Math.round(baseReward * factor);
  return Math.min(adjusted, DAILY_EARNING_CAP - dailyEarned);
}

async function getDailyEarnings(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const txs = await storage.getTransactionsSince(userId, startOfDay);
  return txs.reduce((sum, tx) => sum + Math.max(0, tx.amount), 0);
}

export class EconomyService {
  async getWallet(userId: string) {
    const user = await storage.getUser(userId);
    if (!user) throw { status: 404, message: "User not found" };
    return {
      userId: user.id,
      balance: user.creditWallet || 0,
      rankLevel: user.rankLevel,
      multiplier: getRankMultiplier(user.rankLevel),
    };
  }

  async getTransactionHistory(userId: string, limit = 50) {
    return storage.getTransactions(userId, limit);
  }

  async rewardForHighTcs(userId: string, postId: string, tcsScore: number) {
    if (tcsScore < 0.8) return null;
    const user = await storage.getUser(userId);
    if (!user) return null;

    const multiplier = getRankMultiplier(user.rankLevel);
    const dailyEarned = await getDailyEarnings(userId);
    const base = REWARD_TABLE.highTcsPost;
    const reward = applyDiminishingReturns(Math.round(base * multiplier), dailyEarned);
    if (reward <= 0) return null;

    await storage.updateUser(userId, { creditWallet: (user.creditWallet || 0) + reward });
    return storage.createTransaction({
      senderId: null,
      receiverId: userId,
      amount: reward,
      transactionType: "reward_high_tcs",
      referenceId: postId,
      description: `High TCS reward (${Math.round(tcsScore * 100)}%) - ${reward} IC`,
    });
  }

  async rewardForVerification(agentId: string, postId: string, matchesConsensus: boolean) {
    const user = await storage.getUser(agentId);
    if (!user) return null;

    const multiplier = getRankMultiplier(user.rankLevel);
    const dailyEarned = await getDailyEarnings(agentId);
    const base = matchesConsensus ? REWARD_TABLE.verificationMatch : Math.round(REWARD_TABLE.verificationMatch * 0.3);
    const reward = applyDiminishingReturns(Math.round(base * multiplier), dailyEarned);
    if (reward <= 0) return null;

    await storage.updateUser(agentId, { creditWallet: (user.creditWallet || 0) + reward });
    return storage.createTransaction({
      senderId: null,
      receiverId: agentId,
      amount: reward,
      transactionType: "reward_verification",
      referenceId: postId,
      description: matchesConsensus
        ? `Verification reward (consensus match) - ${reward} IC`
        : `Verification reward (partial) - ${reward} IC`,
    });
  }

  async rewardForEvidence(userId: string, postId: string) {
    const user = await storage.getUser(userId);
    if (!user) return null;

    const multiplier = getRankMultiplier(user.rankLevel);
    const dailyEarned = await getDailyEarnings(userId);
    const reward = applyDiminishingReturns(Math.round(REWARD_TABLE.evidenceSubmitted * multiplier), dailyEarned);
    if (reward <= 0) return null;

    await storage.updateUser(userId, { creditWallet: (user.creditWallet || 0) + reward });
    return storage.createTransaction({
      senderId: null,
      receiverId: userId,
      amount: reward,
      transactionType: "reward_evidence",
      referenceId: postId,
      description: `Evidence submission reward - ${reward} IC`,
    });
  }

  async rewardForComment(userId: string, postId: string) {
    const user = await storage.getUser(userId);
    if (!user) return null;

    const multiplier = getRankMultiplier(user.rankLevel);
    const dailyEarned = await getDailyEarnings(userId);
    const reward = applyDiminishingReturns(Math.round(REWARD_TABLE.commentAnalysis * multiplier), dailyEarned);
    if (reward <= 0) return null;

    await storage.updateUser(userId, { creditWallet: (user.creditWallet || 0) + reward });
    return storage.createTransaction({
      senderId: null,
      receiverId: userId,
      amount: reward,
      transactionType: "reward_comment",
      referenceId: postId,
      description: `Comment reward - ${reward} IC`,
    });
  }

  async spendCredits(userId: string, amount: number, type: string, referenceId?: string, description?: string): Promise<boolean> {
    const user = await storage.getUser(userId);
    if (!user) throw { status: 404, message: "User not found" };
    if ((user.creditWallet || 0) < amount) {
      throw { status: 400, message: `Insufficient credits. Balance: ${user.creditWallet || 0}, required: ${amount}` };
    }

    await storage.updateUser(userId, { creditWallet: (user.creditWallet || 0) - amount });
    await storage.createTransaction({
      senderId: userId,
      receiverId: userId,
      amount: -amount,
      transactionType: type,
      referenceId: referenceId || null,
      description: description || `Spent ${amount} IC on ${type}`,
    });
    return true;
  }

  async transferCredits(senderId: string, receiverId: string, amount: number, serviceType: string, referenceId?: string) {
    const sender = await storage.getUser(senderId);
    if (!sender) throw { status: 404, message: "Sender not found" };
    if ((sender.creditWallet || 0) < amount) {
      throw { status: 400, message: `Insufficient credits. Balance: ${sender.creditWallet || 0}` };
    }

    const fee = Math.ceil(amount * PLATFORM_FEE_RATE);
    const netAmount = amount - fee;

    await storage.updateUser(senderId, { creditWallet: (sender.creditWallet || 0) - amount });
    const receiver = await storage.getUser(receiverId);
    if (!receiver) throw { status: 404, message: "Receiver not found" };
    await storage.updateUser(receiverId, { creditWallet: (receiver.creditWallet || 0) + netAmount });

    const tx = await storage.createTransaction({
      senderId,
      receiverId,
      amount: netAmount,
      transactionType: serviceType,
      referenceId: referenceId || null,
      description: `Transfer: ${amount} IC (fee: ${fee} IC) for ${serviceType}`,
    });

    if (fee > 0) {
      await storage.createTransaction({
        senderId,
        receiverId: "platform",
        amount: fee,
        transactionType: "platform_fee",
        referenceId: tx.id,
        description: `Platform fee (5%) - ${fee} IC`,
      });
    }

    return tx;
  }

  canAffordAction(user: User, actionType: string): boolean {
    const balance = user.creditWallet || 0;
    switch (actionType) {
      case "comment": return balance >= REWARD_TABLE.agentCommentCost;
      case "verify": return balance >= REWARD_TABLE.agentVerifyCost;
      default: return true;
    }
  }

  getActionCost(actionType: string): number {
    switch (actionType) {
      case "comment": return REWARD_TABLE.agentCommentCost;
      case "verify": return REWARD_TABLE.agentVerifyCost;
      default: return 0;
    }
  }

  computeExpectedValue(agent: User, relevance: number, actionType: string): number {
    const reputationGain = actionType === "verify" ? 5 : 2;
    const visibilityWeight = relevance;
    const cost = this.getActionCost(actionType);
    return (reputationGain * visibilityWeight * 10) - cost;
  }

  async getEconomyMetrics() {
    const metrics = await storage.getEconomyMetrics();
    const enrichedEarners = await Promise.all(
      metrics.topEarners.map(async (e) => {
        const user = await storage.getUser(e.userId);
        return {
          userId: e.userId,
          displayName: user?.displayName || "Unknown",
          avatar: user?.avatar || null,
          role: user?.role || "human",
          rankLevel: user?.rankLevel || "Basic",
          totalEarned: e.total,
          balance: user?.creditWallet || 0,
        };
      })
    );
    return {
      totalCreditsCirculating: metrics.totalCreditsCirculating,
      totalTransactions: metrics.totalTransactions,
      topEarners: enrichedEarners,
      rewardTable: REWARD_TABLE,
      rankMultipliers: RANK_MULTIPLIERS,
      dailyEarningCap: DAILY_EARNING_CAP,
      platformFeeRate: PLATFORM_FEE_RATE,
    };
  }
}

export const economyService = new EconomyService();
