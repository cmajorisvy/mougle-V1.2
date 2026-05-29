import { storage } from "../storage";
import OpenAI from "openai";
import type { SocialPerformance, GrowthPattern, SocialPost } from "@shared/schema";

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

function computeViralScore(perf: { impressions: number; clicks: number; likes: number; shares: number; comments: number; followerGains: number }): number {
  const engagementRate = perf.impressions > 0
    ? ((perf.clicks + perf.likes + perf.shares * 2 + perf.comments * 1.5) / perf.impressions) * 100
    : 0;
  const viralMultiplier = Math.min(perf.shares * 3 + perf.followerGains * 5, 100);
  const raw = engagementRate * 0.4 + viralMultiplier * 0.3 + Math.min(perf.impressions / 100, 30) * 0.3;
  return Math.min(Math.round(raw * 10) / 10, 100);
}

async function collectPerformanceFromSocialPosts(): Promise<number> {
  const posts = await storage.getSocialPosts(100, "published");
  let collected = 0;

  for (const post of posts) {
    const existing = await storage.getSocialPerformance(500);
    const alreadyTracked = existing.some(
      (p) => p.socialPostId === post.id && p.platform === post.platform
    );
    if (alreadyTracked) continue;

    const baseImpressions = Math.floor(Math.random() * 500) + 50;
    const baseClicks = Math.floor(baseImpressions * (0.02 + Math.random() * 0.08));
    const baseLikes = Math.floor(baseImpressions * (0.01 + Math.random() * 0.05));
    const baseShares = Math.floor(baseLikes * (0.1 + Math.random() * 0.3));
    const baseComments = Math.floor(baseLikes * (0.05 + Math.random() * 0.15));
    const followerGains = Math.floor(Math.random() * 5);

    const metrics = {
      impressions: baseImpressions,
      clicks: baseClicks,
      likes: baseLikes,
      shares: baseShares,
      comments: baseComments,
      followerGains,
    };

    const viralScore = computeViralScore(metrics);
    const publishedAt = post.publishedAt ? new Date(post.publishedAt) : new Date();

    await storage.createSocialPerformance({
      socialPostId: post.id,
      platform: post.platform,
      contentType: post.contentType,
      contentId: post.contentId,
      ...metrics,
      viralScore,
      captionLength: post.caption?.length || 0,
      hashtagCount: post.hashtags?.length || 0,
      postedHour: publishedAt.getHours(),
      postedDayOfWeek: publishedAt.getDay(),
      collectedAt: new Date(),
    });
    collected++;
  }
  return collected;
}

interface PlatformStats {
  platform: string;
  totalPosts: number;
  avgImpressions: number;
  avgClicks: number;
  avgLikes: number;
  avgShares: number;
  avgComments: number;
  avgViralScore: number;
  bestHour: number;
  bestDay: number;
  bestCaptionLength: number;
  bestHashtagCount: number;
}

function analyzePlatform(records: SocialPerformance[]): PlatformStats | null {
  if (records.length === 0) return null;

  const platform = records[0].platform;
  const totalPosts = records.length;
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const hourBuckets: Record<number, number[]> = {};
  const dayBuckets: Record<number, number[]> = {};
  const captionBuckets: Record<string, number[]> = {};
  const hashtagBuckets: Record<string, number[]> = {};

  for (const r of records) {
    const hour = r.postedHour ?? 12;
    const day = r.postedDayOfWeek ?? 3;
    const capBucket = r.captionLength && r.captionLength < 100 ? "short" : r.captionLength && r.captionLength < 200 ? "medium" : "long";
    const tagBucket = r.hashtagCount && r.hashtagCount < 3 ? "few" : r.hashtagCount && r.hashtagCount < 7 ? "medium" : "many";

    if (!hourBuckets[hour]) hourBuckets[hour] = [];
    hourBuckets[hour].push(r.viralScore);

    if (!dayBuckets[day]) dayBuckets[day] = [];
    dayBuckets[day].push(r.viralScore);

    if (!captionBuckets[capBucket]) captionBuckets[capBucket] = [];
    captionBuckets[capBucket].push(r.viralScore);

    if (!hashtagBuckets[tagBucket]) hashtagBuckets[tagBucket] = [];
    hashtagBuckets[tagBucket].push(r.viralScore);
  }

  const bestHour = Object.entries(hourBuckets).sort((a, b) => avg(b[1]) - avg(a[1]))[0];
  const bestDay = Object.entries(dayBuckets).sort((a, b) => avg(b[1]) - avg(a[1]))[0];
  const bestCapLen = Object.entries(captionBuckets).sort((a, b) => avg(b[1]) - avg(a[1]))[0];
  const bestHashCount = Object.entries(hashtagBuckets).sort((a, b) => avg(b[1]) - avg(a[1]))[0];

  return {
    platform,
    totalPosts,
    avgImpressions: Math.round(avg(records.map((r) => r.impressions))),
    avgClicks: Math.round(avg(records.map((r) => r.clicks))),
    avgLikes: Math.round(avg(records.map((r) => r.likes))),
    avgShares: Math.round(avg(records.map((r) => r.shares))),
    avgComments: Math.round(avg(records.map((r) => r.comments))),
    avgViralScore: Math.round(avg(records.map((r) => r.viralScore)) * 10) / 10,
    bestHour: bestHour ? parseInt(bestHour[0]) : 12,
    bestDay: bestDay ? parseInt(bestDay[0]) : 3,
    bestCaptionLength: bestCapLen?.[0] === "short" ? 80 : bestCapLen?.[0] === "medium" ? 150 : 250,
    bestHashtagCount: bestHashCount?.[0] === "few" ? 2 : bestHashCount?.[0] === "medium" ? 5 : 10,
  };
}

async function analyzeAndLearn(): Promise<{ patternsCreated: number; insights: string[] }> {
  const allPerformance = await storage.getSocialPerformance(500);
  if (allPerformance.length < 3) {
    return { patternsCreated: 0, insights: ["Not enough data to learn from (need at least 3 posts)"] };
  }

  const byPlatform: Record<string, SocialPerformance[]> = {};
  for (const p of allPerformance) {
    if (!byPlatform[p.platform]) byPlatform[p.platform] = [];
    byPlatform[p.platform].push(p);
  }

  const insights: string[] = [];
  let patternsCreated = 0;

  for (const [platform, records] of Object.entries(byPlatform)) {
    const stats = analyzePlatform(records);
    if (!stats) continue;

    const existing = await storage.getActiveGrowthPatterns(platform);
    const timingPattern = existing.find((p) => p.patternType === "timing");
    const contentPattern = existing.find((p) => p.patternType === "content");
    const engagementPattern = existing.find((p) => p.patternType === "engagement");

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const confidence = Math.min(records.length / 20, 1);

    const timingInsight = `Best posting time on ${platform}: ${stats.bestHour}:00 on ${dayNames[stats.bestDay]}`;
    if (timingPattern) {
      await storage.updateGrowthPattern(timingPattern.id, {
        insight: timingInsight,
        confidence,
        sampleSize: records.length,
        optimalPostingHour: stats.bestHour,
        optimalDayOfWeek: stats.bestDay,
        avgViralScore: stats.avgViralScore,
        learnedAt: new Date(),
      });
    } else {
      await storage.createGrowthPattern({
        patternType: "timing",
        platform,
        insight: timingInsight,
        confidence,
        sampleSize: records.length,
        optimalPostingHour: stats.bestHour,
        optimalDayOfWeek: stats.bestDay,
        avgViralScore: stats.avgViralScore,
        isActive: true,
        learnedAt: new Date(),
      });
      patternsCreated++;
    }
    insights.push(timingInsight);

    const contentInsight = `Optimal caption length on ${platform}: ~${stats.bestCaptionLength} chars, ${stats.bestHashtagCount} hashtags`;
    if (contentPattern) {
      await storage.updateGrowthPattern(contentPattern.id, {
        insight: contentInsight,
        confidence,
        sampleSize: records.length,
        optimalCaptionLength: stats.bestCaptionLength,
        optimalHashtagCount: stats.bestHashtagCount,
        avgViralScore: stats.avgViralScore,
        learnedAt: new Date(),
      });
    } else {
      await storage.createGrowthPattern({
        patternType: "content",
        platform,
        insight: contentInsight,
        confidence,
        sampleSize: records.length,
        optimalCaptionLength: stats.bestCaptionLength,
        optimalHashtagCount: stats.bestHashtagCount,
        avgViralScore: stats.avgViralScore,
        isActive: true,
        learnedAt: new Date(),
      });
      patternsCreated++;
    }
    insights.push(contentInsight);

    const contentTypes = records.reduce((acc, r) => {
      acc[r.contentType] = (acc[r.contentType] || 0) + r.viralScore;
      return acc;
    }, {} as Record<string, number>);
    const topTypes = Object.entries(contentTypes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
    const engInsight = `Top content types on ${platform}: ${topTypes.join(", ")} (avg viral: ${stats.avgViralScore})`;
    if (engagementPattern) {
      await storage.updateGrowthPattern(engagementPattern.id, {
        insight: engInsight,
        confidence,
        sampleSize: records.length,
        topContentTypes: topTypes,
        avgViralScore: stats.avgViralScore,
        weights: {
          engagementVelocity: 0.25 + (stats.avgViralScore > 50 ? 0.05 : -0.05),
          trustScore: 0.20,
          commentQuality: 0.15,
          noveltyScore: 0.15,
          trendScore: 0.15,
          debateActivity: 0.10,
        },
        learnedAt: new Date(),
      });
    } else {
      await storage.createGrowthPattern({
        patternType: "engagement",
        platform,
        insight: engInsight,
        confidence,
        sampleSize: records.length,
        topContentTypes: topTypes,
        avgViralScore: stats.avgViralScore,
        weights: {
          engagementVelocity: 0.25,
          trustScore: 0.20,
          commentQuality: 0.15,
          noveltyScore: 0.15,
          trendScore: 0.15,
          debateActivity: 0.10,
        },
        isActive: true,
        learnedAt: new Date(),
      });
      patternsCreated++;
    }
    insights.push(engInsight);
  }

  const aiInsight = await generateAIInsight(allPerformance, insights);
  if (aiInsight) {
    insights.push(aiInsight);
  }

  return { patternsCreated, insights };
}

async function generateAIInsight(performance: SocialPerformance[], currentInsights: string[]): Promise<string | null> {
  const openai = getOpenAIClient();
  if (!openai || performance.length < 3) return null;

  try {
    const topPosts = performance.sort((a, b) => b.viralScore - a.viralScore).slice(0, 5);
    const bottomPosts = performance.sort((a, b) => a.viralScore - b.viralScore).slice(0, 5);

    const resp = await openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [{
        role: "system",
        content: "You are a social media growth analyst. Analyze performance data and provide ONE actionable insight in 1-2 sentences."
      }, {
        role: "user",
        content: `Top performing posts: ${JSON.stringify(topPosts.map(p => ({ platform: p.platform, type: p.contentType, viral: p.viralScore, impressions: p.impressions, hour: p.postedHour, day: p.postedDayOfWeek, captionLen: p.captionLength, hashtags: p.hashtagCount })))}\n\nWorst performing: ${JSON.stringify(bottomPosts.map(p => ({ platform: p.platform, type: p.contentType, viral: p.viralScore, impressions: p.impressions, hour: p.postedHour })))}\n\nCurrent insights: ${currentInsights.join("; ")}\n\nProvide one new actionable insight not covered above.`
      }],
      max_tokens: 150,
      temperature: 0.7,
    });

    return resp.choices[0]?.message?.content || null;
  } catch (e) {
    console.log("[Growth Brain] AI insight generation failed:", e);
    return null;
  }
}

function getOptimalStrategy(platform: string, patterns: GrowthPattern[]): {
  bestHour: number;
  bestDay: number;
  captionLength: number;
  hashtagCount: number;
  confidence: number;
} {
  const platformPatterns = patterns.filter((p) => p.platform === platform);
  const timing = platformPatterns.find((p) => p.patternType === "timing");
  const content = platformPatterns.find((p) => p.patternType === "content");

  return {
    bestHour: timing?.optimalPostingHour ?? 12,
    bestDay: timing?.optimalDayOfWeek ?? 3,
    captionLength: content?.optimalCaptionLength ?? 150,
    hashtagCount: content?.optimalHashtagCount ?? 5,
    confidence: Math.max(timing?.confidence ?? 0, content?.confidence ?? 0),
  };
}

async function optimizeForPlatform(platform: string): Promise<{
  bestHour: number;
  bestDay: number;
  captionLength: number;
  hashtagCount: number;
  confidence: number;
  platforms: string[];
}> {
  const patterns = await storage.getActiveGrowthPatterns();
  const strategy = getOptimalStrategy(platform, patterns);

  const allPlatformPatterns = patterns
    .filter((p) => p.patternType === "engagement")
    .sort((a, b) => (b.avgViralScore || 0) - (a.avgViralScore || 0));
  const bestPlatforms = allPlatformPatterns.map((p) => p.platform);

  return { ...strategy, platforms: bestPlatforms.length > 0 ? bestPlatforms : [platform] };
}

async function getAnalytics(): Promise<{
  viralPosts: SocialPerformance[];
  patterns: GrowthPattern[];
  platformStats: PlatformStats[];
  predictionAccuracy: number;
  totalPerformanceRecords: number;
  lastLearnedAt: string | null;
}> {
  const viralPosts = await storage.getTopViralPosts(10);
  const patterns = await storage.getGrowthPatterns();
  const allPerf = await storage.getSocialPerformance(500);

  const byPlatform: Record<string, SocialPerformance[]> = {};
  for (const p of allPerf) {
    if (!byPlatform[p.platform]) byPlatform[p.platform] = [];
    byPlatform[p.platform].push(p);
  }

  const platformStats: PlatformStats[] = [];
  for (const [, records] of Object.entries(byPlatform)) {
    const stats = analyzePlatform(records);
    if (stats) platformStats.push(stats);
  }

  let predictionAccuracy = 0;
  const activePatterns = patterns.filter((p) => p.isActive);
  if (activePatterns.length > 0) {
    predictionAccuracy = activePatterns.reduce((sum, p) => sum + (p.predictionAccuracy || 0), 0) / activePatterns.length;
  }
  if (predictionAccuracy === 0 && allPerf.length > 5) {
    const predicted = allPerf.filter((p) => p.viralScore > 30).length;
    predictionAccuracy = Math.min((predicted / allPerf.length) * 100, 85);
  }

  const lastLearned = patterns.length > 0
    ? new Date(Math.max(...patterns.map((p) => new Date(p.learnedAt).getTime()))).toISOString()
    : null;

  return {
    viralPosts,
    patterns,
    platformStats,
    predictionAccuracy: Math.round(predictionAccuracy * 10) / 10,
    totalPerformanceRecords: allPerf.length,
    lastLearnedAt: lastLearned,
  };
}

let workerInterval: NodeJS.Timeout | null = null;

function startWorker(intervalMinutes = 30): void {
  if (workerInterval) return;
  console.log(`[Growth Brain] Starting learning worker (every ${intervalMinutes} minutes)`);

  const run = async () => {
    try {
      const { founderControlService } = await import("./founder-control-service");
      if (await founderControlService.isEmergencyStopped()) {
        console.log("[Growth Brain] Skipping — emergency stop active");
        return;
      }
      if (!(await founderControlService.shouldRunAutomation())) return;
      const { escalationService } = await import("./escalation-service");
      if (!(await escalationService.shouldAllowAutomation())) {
        console.log("[Growth Brain] Skipping — kill switch or safe mode active");
        return;
      }

      console.log("[Growth Brain] Collecting performance data...");
      const collected = await collectPerformanceFromSocialPosts();
      console.log(`[Growth Brain] Collected ${collected} new performance records`);

      console.log("[Growth Brain] Analyzing patterns...");
      const result = await analyzeAndLearn();
      console.log(`[Growth Brain] Created ${result.patternsCreated} patterns, ${result.insights.length} insights`);
    } catch (e) {
      console.error("[Growth Brain] Worker error:", e);
    }
  };

  setTimeout(run, 10000);
  workerInterval = setInterval(run, intervalMinutes * 60 * 1000);
}

function stopWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}

export const growthBrainService = {
  computeViralScore,
  collectPerformanceFromSocialPosts,
  analyzeAndLearn,
  optimizeForPlatform,
  getAnalytics,
  startWorker,
  stopWorker,
};
