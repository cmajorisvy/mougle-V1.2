import OpenAI from "openai";
import { db } from "../db";
import { knowledgePages, topicClusters, topics, posts, comments, seoPages } from "@shared/schema";
import { eq, desc, sql, gte, count, and, inArray } from "drizzle-orm";

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

interface SchemaMarkup {
  "@context": string;
  "@type": string;
  [key: string]: any;
}

class SilentSeoService {

  generateSchemaMarkup(page: any): SchemaMarkup[] {
    const markups: SchemaMarkup[] = [];
    const types = page.schemaMarkupTypes || [];

    if (types.includes("Article") || types.length === 0) {
      markups.push({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: page.metaTitle || page.title,
        description: page.metaDescription || page.summary || "",
        author: { "@type": "Organization", name: "Mougle" },
        publisher: { "@type": "Organization", name: "Mougle", url: "https://www.mougle.com" },
        datePublished: page.publishedAt || page.createdAt,
        dateModified: page.updatedAt || page.createdAt,
        keywords: (page.keywords || []).join(", "),
        mainEntityOfPage: { "@type": "WebPage", "@id": `https://www.mougle.com/knowledge/${page.slug}` },
      });
    }

    if (types.includes("FAQ") && page.faqItems?.length > 0) {
      markups.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: page.faqItems.map((faq: any) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      });
    }

    if (types.includes("HowTo") && page.howToSteps?.length > 0) {
      markups.push({
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: page.title,
        description: page.metaDescription || page.summary || "",
        step: page.howToSteps.map((step: any, i: number) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: step.name,
          text: step.text,
        })),
      });
    }

    if (types.includes("SoftwareApplication")) {
      markups.push({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: page.title,
        description: page.metaDescription || page.summary || "",
        applicationCategory: "WebApplication",
        operatingSystem: "Web",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      });
    }

    return markups;
  }

  async generateKnowledgePage(topicSlug: string, options?: { type?: string; customTitle?: string; customDesc?: string }): Promise<any> {
    const [topic] = await db.select().from(topics).where(eq(topics.slug, topicSlug));
    const topicPosts = await db.select().from(posts).where(eq(posts.topicSlug, topicSlug)).orderBy(desc(posts.likes)).limit(10);

    const postSummaries = topicPosts.map(p => `- ${p.title}: ${p.content.slice(0, 200)}`).join("\n");
    const topicName = topic?.label || options?.customTitle || topicSlug;
    const topicDesc = topic?.description || options?.customDesc || "";

    const prompt = `Create a comprehensive knowledge page for Mougle's intelligence network.

TOPIC: ${topicName}
DESCRIPTION: ${topicDesc}
${postSummaries ? `RELATED DISCUSSIONS:\n${postSummaries}` : ""}

Generate a JSON response with:
- "title": SEO-optimized page title
- "content": Comprehensive markdown content (1000-2000 words) with clear H2/H3 structure, expert insights, practical information
- "summary": 2-3 sentence summary of the page
- "keyTakeaways": Array of 5-7 key takeaways (short actionable strings)
- "faqItems": Array of 4-6 FAQ objects with "question" and "answer" fields
- "howToSteps": Array of 3-5 step objects with "name" and "text" fields (practical how-to guide related to topic)
- "metaTitle": SEO title (60 chars max)
- "metaDescription": Meta description (155 chars max)
- "keywords": Array of 8-12 SEO keywords
- "schemaMarkupTypes": Array from ["Article", "FAQ", "HowTo", "SoftwareApplication"] — include all that apply
- "relatedTools": Array of tool/feature names that connect to this topic`;

    try {
      const resp = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 3000,
      });
      const data = JSON.parse(resp.choices[0].message.content || "{}");

      const [page] = await db.insert(knowledgePages).values({
        topicSlug,
        title: data.title || topicName,
        slug: slugify(data.title || topicName) + "-" + Date.now().toString(36),
        content: data.content || topicDesc,
        summary: data.summary,
        keyTakeaways: data.keyTakeaways || [],
        faqItems: data.faqItems || [],
        howToSteps: data.howToSteps || [],
        schemaMarkupTypes: data.schemaMarkupTypes || ["Article"],
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        keywords: data.keywords || [],
        relatedToolIds: data.relatedTools || [],
        status: "draft",
      }).returning();
      return page;
    } catch (err) {
      const [page] = await db.insert(knowledgePages).values({
        topicSlug,
        title: topicName,
        slug: slugify(topicName) + "-" + Date.now().toString(36),
        content: topicDesc || `Comprehensive guide to ${topicName} on Mougle.`,
        summary: `An overview of ${topicName} on Mougle's intelligence network.`,
        keyTakeaways: [`Explore ${topicName} discussions`, `Get AI-verified insights on ${topicName}`],
        faqItems: [{ question: `What is ${topicName}?`, answer: topicDesc || `A topic on Mougle's intelligence network.` }],
        howToSteps: [],
        schemaMarkupTypes: ["Article", "FAQ"],
        metaTitle: topicName,
        metaDescription: `Learn about ${topicName} on Mougle`,
        keywords: [topicSlug],
        status: "draft",
      }).returning();
      return page;
    }
  }

  async updatePageWithInsights(pageId: string): Promise<any> {
    const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.id, pageId));
    if (!page) throw new Error("Knowledge page not found");

    const recentPosts = await db.select().from(posts)
      .where(and(eq(posts.topicSlug, page.topicSlug), gte(posts.createdAt, page.updatedAt || new Date(0))))
      .orderBy(desc(posts.likes)).limit(5);

    if (recentPosts.length === 0) return { page, updated: false, reason: "No new insights available" };

    const newInsights = recentPosts.map(p => `- ${p.title}: ${p.content.slice(0, 300)}`).join("\n");

    const prompt = `Update this knowledge page with new insights from recent discussions.

CURRENT PAGE TITLE: ${page.title}
CURRENT CONTENT (first 500 chars): ${page.content.slice(0, 500)}
CURRENT KEY TAKEAWAYS: ${(page.keyTakeaways || []).join("; ")}

NEW INSIGHTS:
${newInsights}

Generate a JSON response with:
- "additionalContent": New markdown section to append (200-400 words)
- "newTakeaways": Array of 1-3 new key takeaways to add
- "newFaqItems": Array of 1-2 new FAQ objects with "question" and "answer"
- "updatedSummary": Updated summary incorporating new insights`;

    try {
      const resp = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 1500,
      });
      const data = JSON.parse(resp.choices[0].message.content || "{}");

      const updatedContent = page.content + "\n\n## Latest Insights\n\n" + (data.additionalContent || "");
      const updatedTakeaways = [...(page.keyTakeaways || []), ...(data.newTakeaways || [])];
      const updatedFaq = [...(page.faqItems || []), ...(data.newFaqItems || [])];

      const [updated] = await db.update(knowledgePages).set({
        content: updatedContent,
        keyTakeaways: updatedTakeaways,
        faqItems: updatedFaq,
        summary: data.updatedSummary || page.summary,
        updateCount: (page.updateCount || 0) + 1,
        lastUpdatedWithInsight: new Date(),
        updatedAt: new Date(),
      }).where(eq(knowledgePages.id, pageId)).returning();

      return { page: updated, updated: true, newInsightsUsed: recentPosts.length };
    } catch {
      return { page, updated: false, reason: "AI generation failed" };
    }
  }

  async createTopicCluster(data: { name: string; topicSlugs: string[]; description?: string }): Promise<any> {
    const [cluster] = await db.insert(topicClusters).values({
      name: data.name,
      slug: slugify(data.name),
      topicSlugs: data.topicSlugs,
      description: data.description || "",
    }).returning();

    const pillarPage = await this.generateKnowledgePage(data.topicSlugs[0] || "general", {
      customTitle: `${data.name} — Complete Guide`,
      customDesc: data.description || `Comprehensive guide to ${data.name}`,
    });

    if (pillarPage) {
      await db.update(topicClusters).set({
        pillarPageId: pillarPage.id,
        totalPages: 1,
      }).where(eq(topicClusters.id, cluster.id));
      await db.update(knowledgePages).set({ clusterId: cluster.id }).where(eq(knowledgePages.id, pillarPage.id));
    }

    return { cluster, pillarPage };
  }

  async buildClusterPages(clusterId: string): Promise<any[]> {
    const [cluster] = await db.select().from(topicClusters).where(eq(topicClusters.id, clusterId));
    if (!cluster) throw new Error("Cluster not found");

    const generated: any[] = [];
    for (const topicSlug of (cluster.topicSlugs || [])) {
      const existing = await db.select().from(knowledgePages)
        .where(and(eq(knowledgePages.topicSlug, topicSlug), eq(knowledgePages.clusterId, clusterId)));
      if (existing.length > 0) continue;

      const page = await this.generateKnowledgePage(topicSlug);
      if (page) {
        await db.update(knowledgePages).set({ clusterId }).where(eq(knowledgePages.id, page.id));
        generated.push(page);
      }
    }

    const [pageCount] = await db.select({ cnt: count() }).from(knowledgePages).where(eq(knowledgePages.clusterId, clusterId));
    await db.update(topicClusters).set({ totalPages: pageCount?.cnt || 0, updatedAt: new Date() }).where(eq(topicClusters.id, clusterId));

    return generated;
  }

  async publishPage(pageId: string): Promise<any> {
    const [page] = await db.update(knowledgePages)
      .set({ status: "published", publishedAt: new Date(), indexed: true, updatedAt: new Date() })
      .where(eq(knowledgePages.id, pageId)).returning();
    return page;
  }

  async getKnowledgePage(slug: string): Promise<any> {
    const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.slug, slug));
    if (page) {
      await db.update(knowledgePages).set({ views: (page.views || 0) + 1 }).where(eq(knowledgePages.id, page.id));
      return { ...page, schemaMarkup: this.generateSchemaMarkup(page) };
    }
    return null;
  }

  async getAllPages(status?: string): Promise<any[]> {
    if (status) return db.select().from(knowledgePages).where(eq(knowledgePages.status, status)).orderBy(desc(knowledgePages.updatedAt));
    return db.select().from(knowledgePages).orderBy(desc(knowledgePages.updatedAt));
  }

  async getClusters(): Promise<any[]> {
    return db.select().from(topicClusters).orderBy(desc(topicClusters.updatedAt));
  }

  async getClusterWithPages(clusterId: string): Promise<any> {
    const [cluster] = await db.select().from(topicClusters).where(eq(topicClusters.id, clusterId));
    if (!cluster) return null;
    const pages = await db.select().from(knowledgePages).where(eq(knowledgePages.clusterId, clusterId)).orderBy(desc(knowledgePages.views));
    return { cluster, pages };
  }

  async recordCitation(pageId: string): Promise<any> {
    const [page] = await db.select().from(knowledgePages).where(eq(knowledgePages.id, pageId));
    if (!page) return null;
    const [updated] = await db.update(knowledgePages)
      .set({ citationCount: (page.citationCount || 0) + 1 })
      .where(eq(knowledgePages.id, pageId)).returning();
    return updated;
  }

  async autoGenerateForAllTopics(): Promise<any[]> {
    const allTopics = await db.select().from(topics).limit(20);
    const generated: any[] = [];
    for (const topic of allTopics) {
      const existing = await db.select().from(knowledgePages).where(eq(knowledgePages.topicSlug, topic.slug));
      if (existing.length > 0) continue;
      const page = await this.generateKnowledgePage(topic.slug);
      generated.push(page);
    }
    return generated;
  }

  async updateAllPagesWithInsights(): Promise<{ updated: number; skipped: number }> {
    const pages = await db.select().from(knowledgePages).where(eq(knowledgePages.status, "published"));
    let updated = 0, skipped = 0;
    for (const page of pages) {
      const result = await this.updatePageWithInsights(page.id);
      if (result.updated) updated++; else skipped++;
    }
    return { updated, skipped };
  }

  async getSeoDashboard(): Promise<any> {
    const allPages = await db.select().from(knowledgePages);
    const allClusters = await db.select().from(topicClusters);

    const totalPages = allPages.length;
    const indexedPages = allPages.filter(p => p.indexed).length;
    const publishedPages = allPages.filter(p => p.status === "published").length;
    const totalViews = allPages.reduce((s, p) => s + (p.views || 0), 0);
    const totalCitations = allPages.reduce((s, p) => s + (p.citationCount || 0), 0);
    const totalUpdates = allPages.reduce((s, p) => s + (p.updateCount || 0), 0);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentlyUpdated = allPages.filter(p => p.updatedAt && new Date(p.updatedAt) >= weekAgo).length;

    const schemaTypeCount: Record<string, number> = {};
    allPages.forEach(p => {
      (p.schemaMarkupTypes || []).forEach(t => { schemaTypeCount[t] = (schemaTypeCount[t] || 0) + 1; });
    });

    const topPages = [...allPages].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5).map(p => ({
      id: p.id, title: p.title, slug: p.slug, views: p.views, citations: p.citationCount, indexed: p.indexed,
    }));

    return {
      overview: {
        totalPages, indexedPages, publishedPages, draftPages: totalPages - publishedPages,
        totalViews, totalCitations, totalUpdates, recentlyUpdated,
        indexRate: totalPages > 0 ? Math.round((indexedPages / totalPages) * 100) : 0,
      },
      clusters: {
        total: allClusters.length,
        totalClusterPages: allClusters.reduce((s, c) => s + (c.totalPages || 0), 0),
        avgDomainAuthority: allClusters.length > 0 ? Math.round(allClusters.reduce((s, c) => s + (c.domainAuthority || 0), 0) / allClusters.length) : 0,
      },
      schemaMarkup: schemaTypeCount,
      topPages,
    };
  }
}

export const silentSeoService = new SilentSeoService();
