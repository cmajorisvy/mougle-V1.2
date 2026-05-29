import { storage } from "../storage";
import OpenAI from "openai";
import type { PromotionScore } from "@shared/schema";

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

interface ScoreBreakdown {
  engagementVelocity: number;
  trustScore: number;
  commentQuality: number;
  noveltyScore: number;
  debateActivity: number;
  trendScore: number;
  total: number;
  reasoning: string;
}

const SCORE_WEIGHTS = {
  engagementVelocity: 0.25,
  trustScore: 0.20,
  commentQuality: 0.15,
  noveltyScore: 0.15,
  debateActivity: 0.10,
  trendScore: 0.15,
};

async function calculateEngagementVelocity(contentType: string, contentId: string): Promise<number> {
  if (contentType === "news" || contentType === "breaking") {
    const article = await storage.getNewsArticle(parseInt(contentId));
    if (!article) return 0;

    const ageHours = (Date.now() - new Date(article.createdAt).getTime()) / (1000 * 60 * 60);
    if (ageHours < 0.1) return 50;

    const totalEngagement = (article.likesCount || 0) + (article.commentsCount || 0) * 2 + (article.sharesCount || 0) * 3;
    const velocity = totalEngagement / Math.max(ageHours, 1);

    if (velocity > 20) return 100;
    if (velocity > 10) return 80;
    if (velocity > 5) return 60;
    if (velocity > 2) return 40;
    if (velocity > 0.5) return 20;
    return 10;
  }

  if (contentType === "debate") {
    const debate = await storage.getLiveDebate(parseInt(contentId));
    if (!debate) return 0;
    const participants = await storage.getDebateParticipants(parseInt(contentId));
    const turns = await storage.getDebateTurns(parseInt(contentId));
    const activity = participants.length * 10 + turns.length * 5;
    return Math.min(activity, 100);
  }

  if (contentType === "post" || contentType === "trending") {
    const post = await storage.getPost(contentId);
    if (!post) return 0;
    const ageHours = (Date.now() - new Date(post.createdAt || Date.now()).getTime()) / (1000 * 60 * 60);
    const velocity = (post.likes || 0) / Math.max(ageHours, 1);
    return Math.min(velocity * 10, 100);
  }

  return 0;
}

async function calculateTrustScore(contentType: string, contentId: string): Promise<number> {
  if (contentType === "news" || contentType === "breaking") {
    const article = await storage.getNewsArticle(parseInt(contentId));
    if (!article) return 0;

    let score = 50;
    if (article.status === "processed") score += 15;
    if (article.summary && article.summary.length > 100) score += 10;
    if (article.seoBlog && article.seoBlog.length > 200) score += 10;
    if (article.isBreakingNews) score += 10;
    if (article.impactScore && article.impactScore > 70) score += 15;
    if ((article.hashtags?.length || 0) > 0) score += 5;
    return Math.min(score, 100);
  }

  if (contentType === "post" || contentType === "trending") {
    const post = await storage.getPost(contentId);
    if (!post) return 0;
    const author = await storage.getUser(post.authorId);
    if (!author) return 30;
    let score = 30;
    if (author.reputation > 100) score += 20;
    if (author.reputation > 300) score += 15;
    if (author.rankLevel !== "Basic") score += 10;
    if (post.content.length > 200) score += 10;
    return Math.min(score, 100);
  }

  if (contentType === "debate") {
    const debate = await storage.getLiveDebate(parseInt(contentId));
    if (!debate) return 0;
    let score = 40;
    const participants = await storage.getDebateParticipants(parseInt(contentId));
    score += Math.min(participants.length * 10, 30);
    if (debate.status === "completed") score += 20;
    return Math.min(score, 100);
  }

  return 0;
}

async function calculateCommentQuality(contentType: string, contentId: string): Promise<number> {
  if (contentType === "news" || contentType === "breaking") {
    const article = await storage.getNewsArticle(parseInt(contentId));
    if (!article) return 0;
    const commentCount = article.commentsCount || 0;
    if (commentCount === 0) return 10;
    if (commentCount > 10) return 90;
    if (commentCount > 5) return 70;
    if (commentCount > 2) return 50;
    return 30;
  }

  if (contentType === "post" || contentType === "trending") {
    const comments = await storage.getComments(contentId);
    if (comments.length === 0) return 10;
    const avgLength = comments.reduce((s, c) => s + c.content.length, 0) / comments.length;
    let quality = 20;
    if (comments.length > 5) quality += 20;
    if (avgLength > 100) quality += 30;
    if (comments.some(c => c.reasoningType)) quality += 20;
    return Math.min(quality, 100);
  }

  if (contentType === "debate") {
    const turns = await storage.getDebateTurns(parseInt(contentId));
    if (turns.length === 0) return 10;
    const avgLength = turns.reduce((s, t) => s + (t.content?.length || 0), 0) / turns.length;
    let quality = 30;
    if (turns.length > 5) quality += 25;
    if (avgLength > 200) quality += 25;
    return Math.min(quality, 100);
  }

  return 0;
}

async function calculateNoveltyScore(contentType: string, contentId: string): Promise<number> {
  if (contentType === "news" || contentType === "breaking") {
    const article = await storage.getNewsArticle(parseInt(contentId));
    if (!article) return 0;

    let score = 30;
    if (article.isBreakingNews) score += 40;
    const ageHours = (Date.now() - new Date(article.createdAt).getTime()) / (1000 * 60 * 60);
    if (ageHours < 1) score += 30;
    else if (ageHours < 6) score += 20;
    else if (ageHours < 24) score += 10;
    if (article.category && article.category !== "general") score += 10;
    return Math.min(score, 100);
  }

  if (contentType === "debate") {
    const debate = await storage.getLiveDebate(parseInt(contentId));
    if (!debate) return 0;
    let score = 40;
    if (debate.status === "live") score += 30;
    const ageHours = debate.createdAt ? (Date.now() - new Date(debate.createdAt).getTime()) / (1000 * 60 * 60) : 24;
    if (ageHours < 2) score += 20;
    return Math.min(score, 100);
  }

  if (contentType === "post" || contentType === "trending") {
    const post = await storage.getPost(contentId);
    if (!post) return 0;
    let score = 20;
    const ageHours = (Date.now() - new Date(post.createdAt || Date.now()).getTime()) / (1000 * 60 * 60);
    if (ageHours < 2) score += 30;
    if (post.content.length > 500) score += 20;
    if (contentType === "trending") score += 20;
    return Math.min(score, 100);
  }

  return 0;
}

async function calculateDebateActivity(contentType: string, contentId: string): Promise<number> {
  if (contentType === "debate") {
    const debate = await storage.getLiveDebate(parseInt(contentId));
    if (!debate) return 0;
    const participants = await storage.getDebateParticipants(parseInt(contentId));
    const turns = await storage.getDebateTurns(parseInt(contentId));
    let score = 20;
    score += Math.min(participants.length * 15, 40);
    score += Math.min(turns.length * 5, 30);
    if (debate.status === "live") score += 20;
    return Math.min(score, 100);
  }

  if (contentType === "news" || contentType === "breaking") {
    const article = await storage.getNewsArticle(parseInt(contentId));
    if (!article) return 0;
    if (article.debateId) return 80;
    return 10;
  }

  if (contentType === "post" || contentType === "trending") {
    const post = await storage.getPost(contentId);
    if (!post) return 0;
    if (post.isDebate && post.debateActive) return 80;
    if (post.isDebate) return 50;
    return 10;
  }

  return 0;
}

async function calculateTrendScore(contentType: string, contentId: string): Promise<number> {
  if (contentType === "breaking") return 90;
  if (contentType === "trending") return 85;

  if (contentType === "news") {
    const article = await storage.getNewsArticle(parseInt(contentId));
    if (!article) return 0;
    let score = 20;
    if (article.isBreakingNews) score += 50;
    if ((article.impactScore || 0) > 80) score += 30;
    else if ((article.impactScore || 0) > 60) score += 20;
    if ((article.likesCount || 0) + (article.commentsCount || 0) > 10) score += 15;
    return Math.min(score, 100);
  }

  if (contentType === "debate") {
    const debate = await storage.getLiveDebate(parseInt(contentId));
    if (!debate) return 0;
    let score = 30;
    if (debate.status === "live") score += 30;
    const participants = await storage.getDebateParticipants(parseInt(contentId));
    if (participants.length >= 5) score += 20;
    return Math.min(score, 100);
  }

  return 20;
}

function selectPlatforms(contentType: string, totalScore: number): string[] {
  const platforms: string[] = [];

  if (totalScore > 85) {
    platforms.push("twitter", "linkedin", "facebook", "reddit");
  } else if (totalScore > 75) {
    platforms.push("twitter", "linkedin");
    if (contentType === "debate" || contentType === "breaking") platforms.push("reddit");
  } else if (totalScore > 60) {
    platforms.push("twitter");
    if (contentType === "news" || contentType === "breaking") platforms.push("linkedin");
  }

  return platforms;
}

function calculateScheduleTime(contentType: string, totalScore: number): Date {
  const now = new Date();
  if (totalScore > 85 || contentType === "breaking") {
    return now;
  }
  if (totalScore > 75) {
    return new Date(now.getTime() + 15 * 60 * 1000);
  }
  const hour = now.getHours();
  if (hour >= 9 && hour <= 11) return now;
  if (hour >= 14 && hour <= 16) return now;
  const next = new Date(now);
  if (hour < 9) {
    next.setHours(9, 0, 0, 0);
  } else if (hour > 16) {
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
  } else {
    next.setHours(14, 0, 0, 0);
  }
  return next;
}

async function generateReasoning(
  contentType: string,
  contentId: string,
  scores: ScoreBreakdown,
  decision: string
): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    return `Score ${scores.total.toFixed(1)}/100 → ${decision}. ` +
      `Engagement: ${scores.engagementVelocity.toFixed(0)}, Trust: ${scores.trustScore.toFixed(0)}, ` +
      `Comments: ${scores.commentQuality.toFixed(0)}, Novelty: ${scores.noveltyScore.toFixed(0)}, ` +
      `Debate: ${scores.debateActivity.toFixed(0)}, Trend: ${scores.trendScore.toFixed(0)}`;
  }

  try {
    const response = await client.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        {
          role: "system",
          content: "You are a social media promotion analyst. Given content metrics, provide a 1-2 sentence explanation of why this content should or shouldn't be promoted. Be specific about which metrics drove the decision."
        },
        {
          role: "user",
          content: `Content type: ${contentType}, ID: ${contentId}
Scores (0-100 each):
- Engagement Velocity: ${scores.engagementVelocity.toFixed(1)}
- Trust Score: ${scores.trustScore.toFixed(1)}  
- Comment Quality: ${scores.commentQuality.toFixed(1)}
- Novelty: ${scores.noveltyScore.toFixed(1)}
- Debate Activity: ${scores.debateActivity.toFixed(1)}
- Trend Score: ${scores.trendScore.toFixed(1)}
- TOTAL: ${scores.total.toFixed(1)}/100
Decision: ${decision}
Explain why in 1-2 sentences.`
        }
      ],
      max_tokens: 150,
      temperature: 0.3,
    });
    return response.choices[0]?.message?.content || scores.reasoning;
  } catch {
    return `Score ${scores.total.toFixed(1)}/100 → ${decision}. ` +
      `Key factors: Engagement ${scores.engagementVelocity.toFixed(0)}, Trend ${scores.trendScore.toFixed(0)}, Trust ${scores.trustScore.toFixed(0)}.`;
  }
}

export const promotionSelectorAgent = {
  async evaluateContent(contentType: string, contentId: string): Promise<PromotionScore> {
    const existing = await storage.getPromotionScoreByContent(contentType, contentId);
    if (existing && existing.status !== "pending") {
      return existing;
    }

    const [engVel, trust, comments, novelty, debate, trend] = await Promise.all([
      calculateEngagementVelocity(contentType, contentId),
      calculateTrustScore(contentType, contentId),
      calculateCommentQuality(contentType, contentId),
      calculateNoveltyScore(contentType, contentId),
      calculateDebateActivity(contentType, contentId),
      calculateTrendScore(contentType, contentId),
    ]);

    const total =
      engVel * SCORE_WEIGHTS.engagementVelocity +
      trust * SCORE_WEIGHTS.trustScore +
      comments * SCORE_WEIGHTS.commentQuality +
      novelty * SCORE_WEIGHTS.noveltyScore +
      debate * SCORE_WEIGHTS.debateActivity +
      trend * SCORE_WEIGHTS.trendScore;

    let decision: string;
    if (total > 75) decision = "auto_promote";
    else if (total >= 60) decision = "review";
    else decision = "no_promotion";

    const scores: ScoreBreakdown = {
      engagementVelocity: engVel,
      trustScore: trust,
      commentQuality: comments,
      noveltyScore: novelty,
      debateActivity: debate,
      trendScore: trend,
      total,
      reasoning: "",
    };

    const reasoning = await generateReasoning(contentType, contentId, scores, decision);
    const platforms = decision === "auto_promote" ? selectPlatforms(contentType, total) : [];
    const scheduledAt = decision === "auto_promote" ? calculateScheduleTime(contentType, total) : undefined;

    const scoreData = {
      contentType,
      contentId,
      engagementVelocity: engVel,
      trustScore: trust,
      commentQuality: comments,
      noveltyScore: novelty,
      debateActivity: debate,
      trendScore: trend,
      totalScore: total,
      decision,
      reasoning,
      selectedPlatforms: platforms.length > 0 ? platforms : null,
      scheduledAt: scheduledAt || null,
      status: decision === "auto_promote" ? "approved" : decision === "review" ? "pending_review" : "rejected",
      evaluatedAt: new Date(),
    };

    if (existing) {
      return storage.updatePromotionScore(existing.id, scoreData);
    }
    return storage.createPromotionScore(scoreData);
  },

  async processPromotions(): Promise<{ promoted: number; reviewed: number; rejected: number }> {
    const scores = await storage.getPromotionScores(100, "approved");
    let promoted = 0;

    for (const score of scores) {
      if (score.promotedAt) continue;

      const now = new Date();
      if (score.scheduledAt && new Date(score.scheduledAt) > now) continue;

      try {
        const { socialPublisherService } = await import("./social-publisher-service");
        const queued = await socialPublisherService.enqueueForContent(
          score.contentType,
          score.contentId,
          "promotion_engine"
        );

        if (queued > 0) {
          await storage.updatePromotionScore(score.id, {
            status: "promoted",
            promotedAt: now,
          });
          promoted++;
          console.log(`[PromotionEngine] Promoted ${score.contentType}:${score.contentId} (score: ${score.totalScore?.toFixed(1)})`);
        }
      } catch (err) {
        console.log(`[PromotionEngine] Failed to promote ${score.contentType}:${score.contentId}:`, (err as Error).message);
      }
    }

    const pendingReview = await storage.getPendingReviewPromotions();
    const rejected = (await storage.getPromotionScores(100, "rejected")).length;

    return { promoted, reviewed: pendingReview.length, rejected };
  },

  async evaluateRecentContent(): Promise<number> {
    let evaluated = 0;

    try {
      const articles = await storage.getNewsArticles(20);
      for (const article of articles) {
        const existing = await storage.getPromotionScoreByContent(
          article.isBreakingNews ? "breaking" : "news",
          String(article.id)
        );
        if (existing && existing.status !== "pending") continue;

        await this.evaluateContent(
          article.isBreakingNews ? "breaking" : "news",
          String(article.id)
        );
        evaluated++;
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {
      console.log("[PromotionEngine] Error evaluating news:", (err as Error).message);
    }

    try {
      const debates = await storage.getLiveDebates();
      for (const debate of debates) {
        if (debate.status !== "live" && debate.status !== "completed") continue;
        const existing = await storage.getPromotionScoreByContent("debate", String(debate.id));
        if (existing && existing.status !== "pending") continue;

        await this.evaluateContent("debate", String(debate.id));
        evaluated++;
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {
      console.log("[PromotionEngine] Error evaluating debates:", (err as Error).message);
    }

    return evaluated;
  },

  async overrideDecision(
    scoreId: number,
    newDecision: "auto_promote" | "no_promotion",
    overriddenBy: string
  ): Promise<PromotionScore> {
    const score = await storage.getPromotionScore(scoreId);
    if (!score) throw new Error("Promotion score not found");

    const platforms = newDecision === "auto_promote"
      ? selectPlatforms(score.contentType, score.totalScore || 0)
      : [];

    return storage.updatePromotionScore(scoreId, {
      overriddenBy,
      overrideDecision: newDecision,
      decision: newDecision,
      selectedPlatforms: platforms.length > 0 ? platforms : null,
      status: newDecision === "auto_promote" ? "approved" : "rejected",
      scheduledAt: newDecision === "auto_promote" ? new Date() : null,
    });
  },

  startWorker(intervalMinutes = 10) {
    console.log(`[PromotionEngine] Worker started (every ${intervalMinutes} min)`);
    setTimeout(async () => {
      try {
        const { founderControlService } = await import("./founder-control-service");
        if (await founderControlService.isEmergencyStopped()) return;
        const evaluated = await this.evaluateRecentContent();
        const results = await this.processPromotions();
        if (evaluated > 0 || results.promoted > 0) {
          console.log(`[PromotionEngine] Evaluated: ${evaluated}, Promoted: ${results.promoted}, Review: ${results.reviewed}`);
        }
      } catch (err) {
        console.log("[PromotionEngine] Initial run error:", (err as Error).message);
      }
    }, 30000);

    setInterval(async () => {
      try {
        const { founderControlService } = await import("./founder-control-service");
        if (await founderControlService.isEmergencyStopped()) {
          console.log("[PromotionEngine] Skipping — emergency stop active");
          return;
        }
        if (!(await founderControlService.shouldRunAutomation())) return;
        const { escalationService } = await import("./escalation-service");
        if (!(await escalationService.shouldAllowAutomation())) {
          console.log("[PromotionEngine] Skipping — kill switch or safe mode active");
          return;
        }
        const evaluated = await this.evaluateRecentContent();
        const results = await this.processPromotions();
        if (evaluated > 0 || results.promoted > 0) {
          console.log(`[PromotionEngine] Evaluated: ${evaluated}, Promoted: ${results.promoted}, Review: ${results.reviewed}`);
        }
      } catch (err) {
        console.log("[PromotionEngine] Worker error:", (err as Error).message);
      }
    }, intervalMinutes * 60 * 1000);
  },
};
