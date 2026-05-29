import { storage } from "../storage";
import OpenAI from "openai";
import crypto from "crypto";
import { safeFetch, SafeFetchError } from "../lib/safe-image-fetch";

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) {
    console.log("[NewsPipeline] OpenAI API key not configured, skipping AI processing");
    return null;
  }
  return new OpenAI({ apiKey, baseURL });
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

import { loadActiveSources } from "./news-source-registry";

interface PipelineFeed {
  url: string;
  name: string;
  category: string;
}

function categoryForSource(name: string, country: string): string {
  const lower = name.toLowerCase();
  if (lower.startsWith("reddit")) return "ai";
  if (lower.includes("trends")) return "tech";
  if (lower.includes("policy") || lower.includes("regulation")) return "policy";
  if (lower.includes("business") || lower.includes("funding") || lower.includes("venturebeat")) return "business";
  if (lower.includes("science") || lower.includes("research") || lower.includes("arxiv") || lower.includes("stanford")) return "science";
  if (lower.includes("ai") || lower.includes("ml") || lower.includes("deepmind") || lower.includes("openai") || lower.includes("huggingface") || lower.includes("nvidia")) return "ai";
  return "tech";
}

async function loadRegistryFeeds(): Promise<PipelineFeed[]> {
  try {
    const sources = await loadActiveSources();
    return sources.map((s) => ({
      url: s.url,
      name: s.name,
      category: categoryForSource(s.name, s.country),
    }));
  } catch (err) {
    console.warn("[NewsPipeline] Failed to load news_sources registry:", (err as Error).message);
    return [];
  }
}

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  imageUrl?: string;
}

function extractImageFromDescription(description: string): string | null {
  const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
  return imgMatch ? imgMatch[1] : null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();
}

function parseRSSXml(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1] || match[2];

    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/) ||
                      itemXml.match(/<link[^>]+href=["']([^"']+)["']/);
    const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) ||
                      itemXml.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content[^>]*>/);
    const dateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/) ||
                      itemXml.match(/<updated>([\s\S]*?)<\/updated>/) ||
                      itemXml.match(/<published>([\s\S]*?)<\/published>/);
    const mediaMatch = itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/);
    const enclosureMatch = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["']/);

    const title = titleMatch ? stripHtml(titleMatch[1]) : "";
    const link = linkMatch ? stripHtml(linkMatch[1]) : "";
    const description = descMatch ? stripHtml(descMatch[1]) : "";
    const imageUrl = mediaMatch?.[1] || enclosureMatch?.[1] || (descMatch ? extractImageFromDescription(descMatch[1]) : null);

    if (title && link) {
      items.push({
        title,
        link,
        description: description.substring(0, 1000),
        pubDate: dateMatch ? dateMatch[1] : undefined,
        imageUrl: imageUrl || undefined,
      });
    }
  }

  return items;
}

async function fetchRSSFeed(feedUrl: string): Promise<RSSItem[]> {
  try {
    // SSRF-safe fetch: DNS-pinned + private/loopback/link-local hosts refused
    // before any socket is opened. Feed URLs originate from the admin-editable
    // news_sources registry, so they must run through the same guard as the
    // broadcasts cover-proxy (`safeImageFetch`).
    const res = await safeFetch(feedUrl, {
      maxBytes: 10 * 1024 * 1024,
      timeoutMs: 10_000,
      maxRedirects: 3,
      userAgent: "Mougle-NewsBot/1.0",
      acceptHeader: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    });
    if (res.status >= 400) return [];
    const xml = res.body.toString("utf-8");
    return parseRSSXml(xml);
  } catch (err) {
    if (err instanceof SafeFetchError) {
      console.log(`[NewsPipeline] Refused feed ${feedUrl}: ${err.code}`);
    }
    return [];
  }
}

async function isDuplicate(title: string, sourceUrl: string): Promise<boolean> {
  const existingByUrl = await storage.getNewsArticleByUrl(sourceUrl);
  if (existingByUrl) return true;

  const titleHash = generateTitleHash(title);
  const existingByHash = await storage.getNewsArticleByTitleHash(titleHash);
  if (existingByHash) return true;

  return false;
}

async function collectFromAllSources(): Promise<number> {
  let collected = 0;
  const feeds = await loadRegistryFeeds();
  if (feeds.length === 0) {
    console.log("[NewsPipeline] No active sources in news_sources registry — skipping collection cycle");
    return 0;
  }

  for (const feed of feeds) {
    try {
      const items = await fetchRSSFeed(feed.url);

      for (const item of items.slice(0, 5)) {
        if (await isDuplicate(item.title, item.link)) continue;

        const titleHash = generateTitleHash(item.title);
        const slug = generateSlug(item.title);

        await storage.createNewsArticle({
          sourceUrl: item.link,
          sourceName: feed.name,
          sourceType: feed.name.startsWith("Reddit") ? "reddit" : feed.name.startsWith("Google Trends") ? "trends" : "rss",
          originalTitle: item.title,
          originalContent: item.description,
          title: item.title,
          slug,
          titleHash,
          category: feed.category,
          imageUrl: item.imageUrl || null,
          status: "raw",
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        });
        collected++;
      }
    } catch (err) {
      console.log(`[NewsPipeline] Error fetching ${feed.name}:`, (err as Error).message);
    }
  }

  return collected;
}

async function processArticle(articleId: number): Promise<boolean> {
  const article = await storage.getNewsArticle(articleId);
  if (!article || article.status === "processed") return false;

  const openai = getOpenAIClient();
  if (!openai) return false;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [
        {
          role: "system",
          content: `You are a professional AI news editor and SEO specialist. Given a news article title and description, produce a JSON object with these fields:
- "title": A clear, engaging headline (max 80 chars)
- "summary": A concise 2-3 sentence summary of the key points
- "content": A well-formatted article (3-5 paragraphs) expanding on the news with context and analysis
- "seoBlog": An SEO-optimized blog version (4-6 paragraphs) with subheadings marked by **bold**, naturally incorporating relevant keywords for search ranking
- "script": A 60-second video narration script that summarizes the news engagingly, written in a conversational broadcast style
- "hashtags": An array of 5-8 relevant hashtags (without # prefix)
- "category": One of: "ai", "tech", "science", "business", "policy"
- "seoTitle": SEO-optimized page title (max 60 chars)
- "seoDescription": SEO meta description (max 155 chars)

Return ONLY valid JSON, no markdown fencing.`
        },
        {
          role: "user",
          content: `Title: ${article.originalTitle}\n\nDescription: ${article.originalContent || "No description available"}`
        }
      ],
      max_completion_tokens: 1500,
    });

    const responseText = completion.choices[0]?.message?.content?.trim();
    if (!responseText) return false;

    const cleanJson = responseText.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleanJson);

    const processedTitle = parsed.title || article.title;
    const slug = generateSlug(processedTitle, article.id);

    await storage.updateNewsArticle(articleId, {
      title: processedTitle,
      slug,
      summary: parsed.summary || null,
      content: parsed.content || null,
      seoBlog: parsed.seoBlog || null,
      script: parsed.script || null,
      hashtags: parsed.hashtags || [],
      category: parsed.category || article.category,
      status: "processed",
      processedAt: new Date(),
    });

    return true;
  } catch (err) {
    console.log(`[NewsPipeline] AI processing failed for article ${articleId}:`, (err as Error).message);
    return false;
  }
}

export const newsPipelineService = {
  async runPipeline(): Promise<{ collected: number; processed: number }> {
    console.log("[NewsPipeline] Starting news collection from all sources...");
    const collected = await collectFromAllSources();
    console.log(`[NewsPipeline] Collected ${collected} new articles`);

    const unprocessed = await storage.getUnprocessedNews(10);
    let processed = 0;
    const processedIds: number[] = [];

    for (const article of unprocessed) {
      const success = await processArticle(article.id);
      if (success) {
        processed++;
        processedIds.push(article.id);
      }
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[NewsPipeline] Processed ${processed}/${unprocessed.length} articles`);

    if (processedIds.length > 0) {
      try {
        const { breakingNewsAgent } = await import("./breaking-news-agent");
        for (const id of processedIds) {
          await breakingNewsAgent.evaluateAndProcess(id);
        }
      } catch (err) {
        console.log("[NewsPipeline] Breaking news evaluation error:", (err as Error).message);
      }
    }

    return { collected, processed };
  },

  async getArticles(limit = 20, category?: string, offset?: number) {
    return storage.getNewsArticles(limit, category, offset);
  },

  async getArticle(id: number) {
    return storage.getNewsArticle(id);
  },

  async getArticleBySlug(slug: string) {
    return storage.getNewsArticleBySlug(slug);
  },

  async getLatestNews(limit = 5) {
    return storage.getLatestNews(limit);
  },

  async countArticles(category?: string) {
    return storage.countNewsArticles(category);
  },

  startAutoPipeline(intervalMinutes = 60) {
    if ((this as any)._pipelineHandle) return;
    console.log(`[NewsPipeline] Auto-pipeline started (every ${intervalMinutes} min)`);
    this.runPipeline().catch(err => console.error("[NewsPipeline] Initial run error:", err.message));

    (this as any)._pipelineHandle = setInterval(async () => {
      try {
        const { founderControlService } = await import("./founder-control-service");
        if (await founderControlService.isEmergencyStopped()) {
          console.log("[NewsPipeline] Skipping — emergency stop active");
          return;
        }
        if (!(await founderControlService.shouldRunAutomation())) return;
        const { escalationService } = await import("./escalation-service");
        if (!(await escalationService.shouldAllowAutomation())) {
          console.log("[NewsPipeline] Skipping — kill switch or safe mode active");
          return;
        }
        await this.runPipeline();
      } catch (err) {
        console.error("[NewsPipeline] Auto-run error:", (err as Error).message);
      }
    }, intervalMinutes * 60 * 1000);
  },

  stopAutoPipeline() {
    const handle = (this as any)._pipelineHandle as NodeJS.Timeout | undefined;
    if (handle) {
      clearInterval(handle);
      (this as any)._pipelineHandle = null;
      console.log("[NewsPipeline] Auto-pipeline stopped");
    }
  },
};
