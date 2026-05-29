import { db } from "../db";
import {
  knowledgeBaseArticles, ticketSolutions, supportTickets, ticketMessages,
  type KBArticle, type TicketSolution, type SupportTicket
} from "@shared/schema";
import { eq, desc, ilike, or, sql } from "drizzle-orm";
import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    });
  }
  return _openai;
}

export class ZeroSupportLearningService {

  async classifyTicket(subject: string, description: string): Promise<{ category: string; intent: string; suggestedPriority: string }> {
    try {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [
          {
            role: "system",
            content: `You classify support tickets for Mougle platform. Return JSON only.
Categories: billing, technical, account, feature_request, bug_report, general
Intents: question, complaint, request, report, feedback
Priority: low, medium, high, urgent
Respond with: {"category":"...","intent":"...","suggestedPriority":"..."}`
          },
          { role: "user", content: `Subject: ${subject}\nDescription: ${description}` },
        ],
        temperature: 0.2,
        max_tokens: 100,
        response_format: { type: "json_object" },
      });
      return JSON.parse(response.choices[0]?.message?.content || '{"category":"general","intent":"question","suggestedPriority":"medium"}');
    } catch (e) {
      console.error("[ZeroSupport] Classification failed:", e);
      return { category: "general", intent: "question", suggestedPriority: "medium" };
    }
  }

  async extractSolution(ticketId: string): Promise<TicketSolution | null> {
    const existing = await db.select().from(ticketSolutions).where(eq(ticketSolutions.ticketId, ticketId)).limit(1);
    if (existing.length > 0) return existing[0];

    const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    if (!ticket[0]) return null;

    const messages = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, ticketId)).orderBy(ticketMessages.createdAt);
    if (messages.length < 2) return null;

    const conversation = messages.map(m => `[${m.senderType}] ${m.content}`).join("\n\n");

    try {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [
          {
            role: "system",
            content: `Extract the problem and verified solution from this resolved support ticket. Return JSON only.
{"problem":"clear description of the user's problem","solution":"the verified solution that resolved it","category":"billing|technical|account|feature_request|bug_report|general","intent":"question|complaint|request|report|feedback","confidence":0.0-1.0}`
          },
          { role: "user", content: `Subject: ${ticket[0].subject}\n\nConversation:\n${conversation}` },
        ],
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: "json_object" },
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
      if (!parsed.problem || !parsed.solution) return null;

      const [sol] = await db.insert(ticketSolutions).values({
        ticketId,
        problem: parsed.problem,
        solution: parsed.solution,
        category: parsed.category || ticket[0].category,
        intent: parsed.intent || "question",
        confidence: parsed.confidence || 0.7,
      }).returning();

      console.log(`[ZeroSupport] Solution extracted for ticket ${ticketId}`);
      return sol;
    } catch (e) {
      console.error("[ZeroSupport] Solution extraction failed:", e);
      return null;
    }
  }

  async generateKBArticle(solutionIds: string[]): Promise<KBArticle | null> {
    const solutions = [];
    for (const id of solutionIds) {
      const [sol] = await db.select().from(ticketSolutions).where(eq(ticketSolutions.id, id)).limit(1);
      if (sol) solutions.push(sol);
    }
    if (solutions.length === 0) return null;

    const ticketIds = solutions.map(s => s.ticketId);
    const combined = solutions.map(s => `Problem: ${s.problem}\nSolution: ${s.solution}`).join("\n---\n");

    try {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [
          {
            role: "system",
            content: `Generate a knowledge base article from these solved support tickets. Return JSON only.
{"title":"article title","slug":"url-slug","problem":"clear problem description for users","solution":"step-by-step solution","tags":["tag1","tag2"],"category":"billing|technical|account|feature_request|bug_report|general"}`
          },
          { role: "user", content: combined },
        ],
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: "json_object" },
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
      if (!parsed.title || !parsed.solution) return null;

      const [article] = await db.insert(knowledgeBaseArticles).values({
        title: parsed.title,
        slug: parsed.slug || parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60),
        category: parsed.category || solutions[0].category,
        intent: solutions[0].intent,
        problem: parsed.problem || solutions[0].problem,
        solution: parsed.solution,
        tags: parsed.tags || [],
        sourceTicketIds: ticketIds,
        status: "draft",
        autoGenerated: true,
      }).returning();

      for (const sol of solutions) {
        await db.update(ticketSolutions).set({ kbArticleId: article.id }).where(eq(ticketSolutions.id, sol.id));
      }

      console.log(`[ZeroSupport] KB article generated: ${article.title}`);
      return article;
    } catch (e) {
      console.error("[ZeroSupport] KB article generation failed:", e);
      return null;
    }
  }

  async autoGenerateFromTicket(ticketId: string): Promise<{ solution: TicketSolution | null; article: KBArticle | null }> {
    const solution = await this.extractSolution(ticketId);
    if (!solution) return { solution: null, article: null };

    const article = await this.generateKBArticle([solution.id]);
    return { solution, article };
  }

  async searchKB(query: string): Promise<KBArticle[]> {
    const articles = await db.select().from(knowledgeBaseArticles)
      .where(eq(knowledgeBaseArticles.status, "published"))
      .orderBy(desc(knowledgeBaseArticles.helpfulCount));

    if (!articles.length) return [];

    try {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [
          {
            role: "system",
            content: `Given a user query and a list of KB articles, return the IDs of the most relevant articles (max 3) as JSON: {"ids":["id1","id2"]}
Articles:\n${articles.map(a => `ID: ${a.id} | Title: ${a.title} | Problem: ${a.problem}`).join("\n")}`
          },
          { role: "user", content: query },
        ],
        temperature: 0.1,
        max_tokens: 100,
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(response.choices[0]?.message?.content || '{"ids":[]}');
      const matchedIds: string[] = parsed.ids || [];
      return articles.filter(a => matchedIds.includes(a.id));
    } catch {
      return articles.filter(a =>
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.problem.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 3);
    }
  }

  async kbEnhancedChat(message: string): Promise<{ reply: string; sources: { id: string; title: string }[]; preventiveHelp?: string }> {
    const relevantArticles = await this.searchKB(message);
    const kbContext = relevantArticles.length > 0
      ? `\n\nRelevant knowledge base articles:\n${relevantArticles.map(a => `- ${a.title}: Problem: ${a.problem}\n  Solution: ${a.solution}`).join("\n")}`
      : "";

    for (const a of relevantArticles) {
      await db.update(knowledgeBaseArticles).set({ viewCount: (a.viewCount || 0) + 1 }).where(eq(knowledgeBaseArticles.id, a.id));
    }

    try {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [
          {
            role: "system",
            content: `You are Mougle's AI support assistant. Use the knowledge base articles below to provide accurate answers. If KB articles are relevant, cite them. Be concise, friendly, and professional. If you cannot fully resolve the issue, suggest creating a support ticket.
${kbContext}

Also, if the user seems stuck or confused, include a brief preventive tip in your response prefixed with "💡 Tip: " to help them avoid similar issues in the future.

Respond with JSON: {"reply":"your helpful response","preventiveHelp":"optional tip if user seems stuck, or null"}`
          },
          { role: "user", content: message },
        ],
        temperature: 0.5,
        max_tokens: 400,
        response_format: { type: "json_object" },
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content || '{"reply":"I\'m here to help! Could you tell me more?"}');
      return {
        reply: parsed.reply || "I'm here to help! Could you tell me more about your issue?",
        sources: relevantArticles.map(a => ({ id: a.id, title: a.title })),
        preventiveHelp: parsed.preventiveHelp || undefined,
      };
    } catch (e) {
      console.error("[ZeroSupport] KB-enhanced chat failed:", e);
      return {
        reply: "I'm here to help! Could you tell me more about your issue?",
        sources: [],
      };
    }
  }

  async getPreventiveHelp(context: string): Promise<string[]> {
    const published = await db.select().from(knowledgeBaseArticles)
      .where(eq(knowledgeBaseArticles.status, "published"))
      .orderBy(desc(knowledgeBaseArticles.viewCount))
      .limit(10);

    if (!published.length) return [];

    try {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [
          {
            role: "system",
            content: `Given the user's current context and common issues from our knowledge base, suggest 1-3 brief preventive help prompts. Return JSON: {"prompts":["prompt1","prompt2"]}
Common issues:\n${published.map(a => `- ${a.title}: ${a.problem}`).join("\n")}`
          },
          { role: "user", content: `User context: ${context}` },
        ],
        temperature: 0.3,
        max_tokens: 200,
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(response.choices[0]?.message?.content || '{"prompts":[]}');
      return parsed.prompts || [];
    } catch {
      return [];
    }
  }

  // KB CRUD
  async getAllArticles(status?: string): Promise<KBArticle[]> {
    if (status) {
      return db.select().from(knowledgeBaseArticles).where(eq(knowledgeBaseArticles.status, status)).orderBy(desc(knowledgeBaseArticles.createdAt));
    }
    return db.select().from(knowledgeBaseArticles).orderBy(desc(knowledgeBaseArticles.createdAt));
  }

  async getArticleById(id: string): Promise<KBArticle | null> {
    const [a] = await db.select().from(knowledgeBaseArticles).where(eq(knowledgeBaseArticles.id, id)).limit(1);
    return a || null;
  }

  async approveArticle(id: string, approvedBy: string): Promise<KBArticle | null> {
    const [a] = await db.update(knowledgeBaseArticles)
      .set({ status: "published", approvedBy, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(knowledgeBaseArticles.id, id)).returning();
    return a || null;
  }

  async rejectArticle(id: string): Promise<KBArticle | null> {
    const [a] = await db.update(knowledgeBaseArticles)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(knowledgeBaseArticles.id, id)).returning();
    return a || null;
  }

  async updateArticle(id: string, data: { title?: string; problem?: string; solution?: string; tags?: string[]; category?: string }): Promise<KBArticle | null> {
    const [a] = await db.update(knowledgeBaseArticles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(knowledgeBaseArticles.id, id)).returning();
    return a || null;
  }

  async markHelpful(id: string): Promise<void> {
    const article = await this.getArticleById(id);
    if (article) {
      await db.update(knowledgeBaseArticles).set({ helpfulCount: (article.helpfulCount || 0) + 1 }).where(eq(knowledgeBaseArticles.id, id));
    }
  }

  async getSolutions(ticketId?: string): Promise<TicketSolution[]> {
    if (ticketId) {
      return db.select().from(ticketSolutions).where(eq(ticketSolutions.ticketId, ticketId)).orderBy(desc(ticketSolutions.extractedAt));
    }
    return db.select().from(ticketSolutions).orderBy(desc(ticketSolutions.extractedAt));
  }

  async getLearningStats(): Promise<{
    totalArticles: number; published: number; drafts: number;
    totalSolutions: number; totalViews: number; totalHelpful: number;
    topArticles: KBArticle[];
  }> {
    const articles = await db.select().from(knowledgeBaseArticles);
    const solutions = await db.select().from(ticketSolutions);
    return {
      totalArticles: articles.length,
      published: articles.filter(a => a.status === "published").length,
      drafts: articles.filter(a => a.status === "draft").length,
      totalSolutions: solutions.length,
      totalViews: articles.reduce((sum, a) => sum + (a.viewCount || 0), 0),
      totalHelpful: articles.reduce((sum, a) => sum + (a.helpfulCount || 0), 0),
      topArticles: articles.filter(a => a.status === "published").sort((a, b) => (b.helpfulCount || 0) - (a.helpfulCount || 0)).slice(0, 5),
    };
  }
}

export const zeroSupportLearningService = new ZeroSupportLearningService();
