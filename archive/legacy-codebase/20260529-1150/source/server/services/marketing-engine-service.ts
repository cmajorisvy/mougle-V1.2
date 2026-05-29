import OpenAI from "openai";
import { db } from "../db";
import { marketingArticles, seoPages, referralLinks, posts, topics, socialPosts, users, comments } from "@shared/schema";
import { eq, desc, sql, gte, count, and } from "drizzle-orm";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "missing",
    });
  }
  return _openai;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

class MarketingEngineService {

  async convertDiscussionToArticle(postId: string): Promise<any> {
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) throw new Error("Post not found");

    const postComments = await db.select().from(comments).where(eq(comments.postId, postId)).orderBy(comments.createdAt).limit(20);
    const commentText = postComments.map(c => c.content).join("\n---\n");

    const prompt = `Convert this discussion into an SEO-optimized blog article for Mougle, a hybrid intelligence network.

DISCUSSION TITLE: ${post.title}
CONTENT: ${post.content}
${commentText ? `COMMENTS/RESPONSES:\n${commentText}` : ""}

Generate a JSON response with:
- "title": SEO-friendly article title
- "content": Full article in markdown (800-1500 words), structured with headings, key insights, and actionable takeaways
- "metaDescription": SEO meta description (150 chars max)
- "keywords": Array of 5-8 SEO keywords
- "category": One of: insight, analysis, guide, industry-news, tool-review`;

    try {
      const resp = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });
      const data = JSON.parse(resp.choices[0].message.content || "{}");

      const [article] = await db.insert(marketingArticles).values({
        sourceType: "discussion",
        sourceId: postId,
        title: data.title || post.title,
        slug: slugify(data.title || post.title) + "-" + Date.now().toString(36),
        content: data.content || post.content,
        metaDescription: data.metaDescription,
        keywords: data.keywords || [],
        category: data.category || "insight",
        status: "draft",
      }).returning();
      return article;
    } catch (err) {
      const [article] = await db.insert(marketingArticles).values({
        sourceType: "discussion",
        sourceId: postId,
        title: post.title,
        slug: slugify(post.title) + "-" + Date.now().toString(36),
        content: post.content,
        metaDescription: post.seoDescription || post.title,
        keywords: [],
        category: "insight",
        status: "draft",
      }).returning();
      return article;
    }
  }

  async generateSeoPage(type: string, referenceId: string, context: { name: string; description: string }): Promise<any> {
    const prompt = `Create an SEO landing page for Mougle platform.

TYPE: ${type}
NAME: ${context.name}
DESCRIPTION: ${context.description}

Generate a JSON response with:
- "title": SEO page title
- "content": Structured markdown content (500-800 words) with benefits, features, how-to sections
- "metaDescription": Meta description (150 chars max)
- "keywords": Array of 5-8 keywords`;

    try {
      const resp = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 1500,
      });
      const data = JSON.parse(resp.choices[0].message.content || "{}");

      const [page] = await db.insert(seoPages).values({
        type,
        referenceId,
        title: data.title || context.name,
        slug: slugify(data.title || context.name) + "-" + Date.now().toString(36),
        content: data.content || context.description,
        metaDescription: data.metaDescription,
        keywords: data.keywords || [],
        indexed: false,
      }).returning();
      return page;
    } catch (err) {
      const [page] = await db.insert(seoPages).values({
        type,
        referenceId,
        title: context.name,
        slug: slugify(context.name) + "-" + Date.now().toString(36),
        content: context.description,
        metaDescription: context.description.slice(0, 150),
        keywords: [],
        indexed: false,
      }).returning();
      return page;
    }
  }

  async autoGenerateToolSeoPages(): Promise<any[]> {
    const allTopics = await db.select().from(topics).limit(20);
    const generated: any[] = [];
    for (const topic of allTopics) {
      const existing = await db.select().from(seoPages).where(and(eq(seoPages.type, "topic"), eq(seoPages.referenceId, topic.id)));
      if (existing.length > 0) continue;
      const page = await this.generateSeoPage("topic", topic.id, { name: topic.label, description: topic.description || `Explore ${topic.label} on Mougle` });
      generated.push(page);
    }
    return generated;
  }

  async generateDailySummary(): Promise<any> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentPosts = await db.select().from(posts).where(gte(posts.createdAt, yesterday)).orderBy(desc(posts.likes)).limit(10);

    if (recentPosts.length === 0) return null;

    const postsText = recentPosts.map(p => `- ${p.title}: ${p.content.slice(0, 200)}`).join("\n");
    const prompt = `Create an AI-generated daily intelligence summary for Mougle.

TODAY'S TOP DISCUSSIONS:
${postsText}

Generate a JSON response with:
- "title": Engaging daily summary title with today's date theme
- "content": Markdown summary (400-600 words) covering key insights, trends, and highlights
- "metaDescription": Meta description (150 chars)
- "keywords": Array of relevant keywords`;

    try {
      const resp = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 1200,
      });
      const data = JSON.parse(resp.choices[0].message.content || "{}");

      const [article] = await db.insert(marketingArticles).values({
        sourceType: "daily_summary",
        sourceId: new Date().toISOString().split("T")[0],
        title: data.title || `Mougle Intelligence Digest — ${new Date().toLocaleDateString()}`,
        slug: `daily-digest-${new Date().toISOString().split("T")[0]}`,
        content: data.content || postsText,
        metaDescription: data.metaDescription,
        keywords: data.keywords || [],
        category: "daily-digest",
        status: "published",
        publishedAt: new Date(),
      }).returning();
      return article;
    } catch {
      return null;
    }
  }

  async selectHighQualityForSocial(): Promise<any[]> {
    const recentPosts = await db.select().from(posts).orderBy(desc(posts.likes)).limit(5);
    const selected: any[] = [];

    for (const post of recentPosts) {
      if (post.likes < 1 && (post.verificationScore || 0) < 0.3) continue;

      const prompt = `Create a social media text post for this content from Mougle:

TITLE: ${post.title}
CONTENT: ${post.content.slice(0, 500)}

Generate JSON with:
- "caption": Engaging social post text (max 280 chars) with call-to-action
- "hashtags": Array of 3-5 relevant hashtags`;

      try {
        const resp = await getOpenAI().chat.completions.create({
          model: "gpt-5.5",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_tokens: 300,
        });
        const data = JSON.parse(resp.choices[0].message.content || "{}");

        const [sp] = await db.insert(socialPosts).values({
          platform: "twitter",
          contentType: "post",
          contentId: post.id,
          caption: data.caption || post.title,
          hashtags: data.hashtags || [],
          callToAction: "Join the discussion on Mougle",
          status: "pending",
        }).returning();
        selected.push(sp);
      } catch {
        continue;
      }
    }
    return selected;
  }

  async getOrCreateReferralLink(userId: string): Promise<any> {
    const [existing] = await db.select().from(referralLinks).where(eq(referralLinks.userId, userId));
    if (existing) return existing;

    const code = `dig8-${userId.slice(0, 6)}-${Math.random().toString(36).slice(2, 8)}`;
    const [link] = await db.insert(referralLinks).values({ userId, code }).returning();
    return link;
  }

  async trackReferralClick(code: string): Promise<boolean> {
    const [link] = await db.select().from(referralLinks).where(eq(referralLinks.code, code));
    if (!link) return false;
    await db.update(referralLinks).set({ clicks: (link.clicks || 0) + 1, lastClickedAt: new Date() }).where(eq(referralLinks.id, link.id));
    return true;
  }

  async trackReferralConversion(code: string): Promise<boolean> {
    const [link] = await db.select().from(referralLinks).where(eq(referralLinks.code, code));
    if (!link) return false;
    await db.update(referralLinks).set({ conversions: (link.conversions || 0) + 1 }).where(eq(referralLinks.id, link.id));
    return true;
  }

  async publishArticle(articleId: string): Promise<any> {
    const [article] = await db.update(marketingArticles)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(marketingArticles.id, articleId)).returning();
    return article;
  }

  async getArticles(status?: string): Promise<any[]> {
    if (status) return db.select().from(marketingArticles).where(eq(marketingArticles.status, status)).orderBy(desc(marketingArticles.createdAt));
    return db.select().from(marketingArticles).orderBy(desc(marketingArticles.createdAt));
  }

  async getArticleBySlug(slug: string): Promise<any> {
    const [article] = await db.select().from(marketingArticles).where(eq(marketingArticles.slug, slug));
    if (article) {
      await db.update(marketingArticles).set({ views: (article.views || 0) + 1 }).where(eq(marketingArticles.id, article.id));
    }
    return article || null;
  }

  async getSeoPages(): Promise<any[]> {
    return db.select().from(seoPages).orderBy(desc(seoPages.createdAt));
  }

  async getSeoPageBySlug(slug: string): Promise<any> {
    const [page] = await db.select().from(seoPages).where(eq(seoPages.slug, slug));
    if (page) {
      await db.update(seoPages).set({ views: (page.views || 0) + 1 }).where(eq(seoPages.id, page.id));
    }
    return page || null;
  }

  async indexSeoPage(pageId: string): Promise<any> {
    const [page] = await db.update(seoPages).set({ indexed: true }).where(eq(seoPages.id, pageId)).returning();
    return page;
  }

  async getReferralStats(): Promise<any[]> {
    return db.select().from(referralLinks).orderBy(desc(referralLinks.clicks));
  }

  async getGrowthDashboard(): Promise<any> {
    const [articleCount] = await db.select({ cnt: count() }).from(marketingArticles);
    const [publishedCount] = await db.select({ cnt: count() }).from(marketingArticles).where(eq(marketingArticles.status, "published"));
    const [seoPageCount] = await db.select({ cnt: count() }).from(seoPages);
    const [indexedCount] = await db.select({ cnt: count() }).from(seoPages).where(eq(seoPages.indexed, true));
    const [referralCount] = await db.select({ cnt: count() }).from(referralLinks);
    const [socialCount] = await db.select({ cnt: count() }).from(socialPosts);

    const allReferrals = await db.select().from(referralLinks);
    const totalClicks = allReferrals.reduce((s, r) => s + (r.clicks || 0), 0);
    const totalConversions = allReferrals.reduce((s, r) => s + (r.conversions || 0), 0);

    const allArticles = await db.select().from(marketingArticles);
    const totalArticleViews = allArticles.reduce((s, a) => s + (a.views || 0), 0);

    const allSeo = await db.select().from(seoPages);
    const totalSeoViews = allSeo.reduce((s, p) => s + (p.views || 0), 0);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [weekArticles] = await db.select({ cnt: count() }).from(marketingArticles).where(gte(marketingArticles.createdAt, weekAgo));
    const [weekSocial] = await db.select({ cnt: count() }).from(socialPosts).where(gte(socialPosts.createdAt, weekAgo));

    return {
      articles: {
        total: articleCount?.cnt || 0,
        published: publishedCount?.cnt || 0,
        totalViews: totalArticleViews,
        thisWeek: weekArticles?.cnt || 0,
      },
      seoPages: {
        total: seoPageCount?.cnt || 0,
        indexed: indexedCount?.cnt || 0,
        totalViews: totalSeoViews,
      },
      referrals: {
        totalLinks: referralCount?.cnt || 0,
        totalClicks,
        totalConversions,
        conversionRate: totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 100) : 0,
      },
      social: {
        totalPosts: socialCount?.cnt || 0,
        thisWeek: weekSocial?.cnt || 0,
      },
      trafficSources: {
        organic: totalArticleViews + totalSeoViews,
        referral: totalClicks,
        social: 0,
      },
    };
  }
}

export const marketingEngineService = new MarketingEngineService();
