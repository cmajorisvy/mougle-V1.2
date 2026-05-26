import { storage } from "../storage";
import OpenAI from "openai";
import crypto from "crypto";
import Parser from "rss-parser";
import { loadActiveSources } from "./news-source-registry";
import { safeFetch, SafeFetchError } from "../lib/safe-image-fetch";

interface FeedConfig {
  name: string;
  url: string;
}

interface ProcessedArticle {
  summary: string;
  category: string;
  impact: string;
}

const AI_CATEGORIES = ["Research", "Product", "Funding", "Policy", "Open Source", "Breakthrough"] as const;
const IMPACT_LEVELS = ["High", "Medium", "Low"] as const;

let isRunning = false;

async function loadFeedConfig(): Promise<FeedConfig[]> {
  try {
    const sources = await loadActiveSources();
    return sources.map((s) => ({ name: s.name, url: s.url }));
  } catch (err) {
    console.error("[NewsService] Failed to load news_sources registry:", (err as Error).message);
    return [];
  }
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) {
    console.log("[NewsService] OpenAI API key not configured, skipping AI processing");
    return null;
  }
  return new OpenAI({ apiKey, baseURL });
}

function generateUrlHash(url: string): string {
  return crypto.createHash("sha256").update(url.trim()).digest("hex").substring(0, 16);
}

function generateTitleHash(title: string): string {
  const normalized = title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(normalized).digest("hex").substring(0, 16);
}

function generateSlug(title: string, id?: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 80)
    .replace(/^-|-$/g, "");
  return id ? `${base}-${id}` : base;
}

function mapCategoryToStored(category: string): string {
  const map: Record<string, string> = {
    "Research": "research",
    "Product": "product",
    "Funding": "funding",
    "Policy": "policy",
    "Open Source": "opensource",
    "Breakthrough": "breakthrough",
  };
  return map[category] || "ai";
}

function mapImpactToScore(impact: string): number {
  const map: Record<string, number> = { "High": 90, "Medium": 60, "Low": 30 };
  return map[impact] || 50;
}

const AI_SUMMARIZATION_PROMPT = `You are an AI news analyst.
Summarize this article in 2 concise sentences.
Explain why it matters for AI development.
Return JSON:
{
  "summary": "",
  "category": "",
  "impact": ""
}

Category must be one of: Research, Product, Funding, Policy, Open Source, Breakthrough
Impact must be one of: High, Medium, Low

Return ONLY valid JSON, no markdown fencing.`;

async function fetchFeed(feed: FeedConfig): Promise<Parser.Item[]> {
  const parser = new Parser();

  try {
    // SSRF-safe fetch: DNS-pinned + private/loopback/link-local hosts refused
    // before any socket is opened. Admins can edit feed URLs in the news_sources
    // registry, so this must run through the same guard as the broadcasts
    // cover-proxy (`safeImageFetch`).
    const res = await safeFetch(feed.url, {
      maxBytes: 10 * 1024 * 1024,
      timeoutMs: 15_000,
      maxRedirects: 3,
      userAgent: "Mougle-NewsBot/2.0",
      acceptHeader: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    });
    if (res.status >= 400) {
      console.log(`[NewsService] Failed to fetch ${feed.name} (${feed.url}): HTTP ${res.status}`);
      return [];
    }
    const xml = res.body.toString("utf-8");
    const result = await parser.parseString(xml);
    return result.items || [];
  } catch (err) {
    const msg = err instanceof SafeFetchError ? `${err.code}` : (err as Error).message;
    console.log(`[NewsService] Failed to fetch ${feed.name} (${feed.url}): ${msg}`);
    return [];
  }
}

async function isDuplicate(title: string, url: string): Promise<boolean> {
  const existingByUrl = await storage.getNewsArticleByUrl(url);
  if (existingByUrl) return true;

  const titleHash = generateTitleHash(title);
  const existingByHash = await storage.getNewsArticleByTitleHash(titleHash);
  if (existingByHash) return true;

  return false;
}

async function collectFromFeeds(): Promise<number> {
  const feeds = await loadFeedConfig();
  if (feeds.length === 0) {
    console.log("[NewsService] No feeds configured");
    return 0;
  }

  let collected = 0;

  for (const feed of feeds) {
    try {
      const items = await fetchFeed(feed);
      console.log(`[NewsService] ${feed.name}: fetched ${items.length} items`);

      for (const item of items.slice(0, 10)) {
        const title = item.title?.trim();
        const link = item.link?.trim();
        if (!title || !link) continue;

        if (await isDuplicate(title, link)) continue;

        const titleHash = generateTitleHash(title);
        const slug = generateSlug(title);
        const description = item.contentSnippet || item.content || item.summary || "";
        const imageUrl = (item as any).enclosure?.url
          || (item as any)["media:content"]?.["$"]?.url
          || extractImageFromHtml(item.content || "")
          || null;

        await storage.createNewsArticle({
          sourceUrl: link,
          sourceName: feed.name,
          sourceType: "rss",
          originalTitle: title,
          originalContent: typeof description === "string" ? description.substring(0, 2000) : "",
          title,
          slug,
          titleHash,
          category: "ai",
          imageUrl,
          status: "raw",
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        });
        collected++;
      }
    } catch (err) {
      console.log(`[NewsService] Error processing feed ${feed.name}:`, (err as Error).message);
    }
  }

  return collected;
}

function extractImageFromHtml(html: string): string | null {
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return imgMatch ? imgMatch[1] : null;
}

async function processArticleWithAI(articleId: number): Promise<boolean> {
  const article = await storage.getNewsArticle(articleId);
  if (!article || article.status === "processed") return false;

  const openai = getOpenAIClient();
  if (!openai) return false;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        { role: "system", content: AI_SUMMARIZATION_PROMPT },
        {
          role: "user",
          content: `Title: ${article.originalTitle}\n\nContent: ${article.originalContent || "No description available"}`,
        },
      ],
      max_completion_tokens: 500,
    });

    const responseText = completion.choices[0]?.message?.content?.trim();
    if (!responseText) return false;

    const cleanJson = responseText.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
    const parsed: ProcessedArticle = JSON.parse(cleanJson);

    const category = AI_CATEGORIES.includes(parsed.category as any) ? parsed.category : "Research";
    const impact = IMPACT_LEVELS.includes(parsed.impact as any) ? parsed.impact : "Medium";
    const impactScore = mapImpactToScore(impact);
    const storedCategory = mapCategoryToStored(category);

    const slug = generateSlug(article.originalTitle, article.id);

    await storage.updateNewsArticle(articleId, {
      summary: parsed.summary || null,
      category: storedCategory,
      impactScore,
      slug,
      status: "processed",
      processedAt: new Date(),
      hashtags: [category, impact],
    });

    return true;
  } catch (err) {
    console.log(`[NewsService] AI processing failed for article ${articleId}:`, (err as Error).message);
    return false;
  }
}

export const newsService = {
  async runNewsFetcher(): Promise<{ collected: number; processed: number }> {
    if (isRunning) {
      console.log("[NewsService] Already running, skipping...");
      return { collected: 0, processed: 0 };
    }
    isRunning = true;
    try {
      return await this._doFetch();
    } finally {
      isRunning = false;
    }
  },

  async _doFetch(): Promise<{ collected: number; processed: number }> {
    console.log("[NewsService] Starting automated AI news fetch...");
    const collected = await collectFromFeeds();
    console.log(`[NewsService] Collected ${collected} new articles from RSS feeds`);

    const unprocessed = await storage.getUnprocessedNews(15);
    let processed = 0;

    for (const article of unprocessed) {
      const success = await processArticleWithAI(article.id);
      if (success) processed++;
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log(`[NewsService] AI-processed ${processed}/${unprocessed.length} articles`);

    if (processed > 0) {
      try {
        const { breakingNewsAgent } = await import("./breaking-news-agent");
        for (const article of unprocessed.slice(0, processed)) {
          await breakingNewsAgent.evaluateAndProcess(article.id);
        }
      } catch (err) {
        console.log("[NewsService] Breaking news evaluation skipped:", (err as Error).message);
      }
    }

    return { collected, processed };
  },

  async getLatestNews(limit = 20) {
    return storage.getNewsArticles(limit);
  },

  startScheduler(intervalMinutes = 30) {
    if ((this as any)._schedulerHandle) return;
    console.log(`[NewsService] Scheduler started — fetching every ${intervalMinutes} minutes`);

    this.runNewsFetcher().catch((err) =>
      console.error("[NewsService] Initial fetch error:", err.message)
    );

    (this as any)._schedulerHandle = setInterval(async () => {
      try {
        const { founderControlService } = await import("./founder-control-service");
        if (await founderControlService.isEmergencyStopped()) {
          console.log("[NewsService] Skipping — emergency stop active");
          return;
        }
        if (!(await founderControlService.shouldRunAutomation())) return;
        await this.runNewsFetcher();
      } catch (err) {
        console.error("[NewsService] Scheduled fetch error:", (err as Error).message);
      }
    }, intervalMinutes * 60 * 1000);
  },

  stopScheduler() {
    const handle = (this as any)._schedulerHandle as NodeJS.Timeout | undefined;
    if (handle) {
      clearInterval(handle);
      (this as any)._schedulerHandle = null;
      console.log("[NewsService] Scheduler stopped");
    }
  },
};
