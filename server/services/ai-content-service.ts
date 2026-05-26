import OpenAI from "openai";
import { db } from "../db";
import { posts, liveDebates, comments } from "@shared/schema";
import { eq, desc, isNull } from "drizzle-orm";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (openaiClient) return openaiClient;

  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY or AI_INTEGRATIONS_OPENAI_API_KEY must be set in the environment.");
  }

  openaiClient = new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
  });
  return openaiClient;
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-5.5",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });
  return response.choices[0]?.message?.content || "{}";
}

function safeParseJSON(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    console.error("[AIContent] Failed to parse AI response JSON");
    return null;
  }
}

function validateFaqItems(items: any): { question: string; answer: string }[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item: any) => typeof item?.question === "string" && typeof item?.answer === "string")
    .slice(0, 10)
    .map((item: any) => ({
      question: item.question.substring(0, 500),
      answer: item.answer.substring(0, 1000),
    }));
}

function validateStringArray(arr: any): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((s: any) => typeof s === "string").slice(0, 10).map((s: string) => s.substring(0, 500));
}

export const aiContentService = {
  async generatePostSEO(postId: string): Promise<any> {
    if (!postId || typeof postId !== "string") throw new Error("Valid postId required");

    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) throw new Error("Post not found");

    const postComments = await db
      .select({ content: comments.content, authorId: comments.authorId })
      .from(comments)
      .where(eq(comments.postId, postId))
      .orderBy(desc(comments.createdAt))
      .limit(20);

    const commentContext = postComments.length > 0
      ? `\n\nDiscussion comments:\n${postComments.map(c => `- ${c.content}`).join("\n")}`
      : "";

    const systemPrompt = `You are an SEO content analyst for a hybrid human-AI discussion platform. Generate structured content optimized for AI citation by systems like ChatGPT, Perplexity, Claude, and Gemini. Always produce factual, neutral, well-structured output. Return valid JSON.`;

    const userPrompt = `Analyze this discussion post and generate SEO-optimized content for AI citation.

Title: ${post.title}
Topic: ${post.topicSlug}
Content: ${post.content.substring(0, 3000)}${commentContext}

Return JSON with:
{
  "aiSummary": "A neutral 2-3 sentence factual summary of the post's main argument and findings",
  "keyTakeaways": ["3-5 concise bullet point takeaways as strings"],
  "faqItems": [{"question": "Relevant question", "answer": "Concise factual answer"}],
  "seoTitle": "Optimized title under 60 chars",
  "seoDescription": "Meta description under 155 chars"
}

Generate 3-5 FAQ items that someone researching this topic would ask. Keep answers factual and neutral.`;

    const raw = await callOpenAI(systemPrompt, userPrompt);
    const result = safeParseJSON(raw);

    if (!result) {
      throw new Error("AI response was not valid JSON");
    }

    const aiSummary = typeof result.aiSummary === "string" ? result.aiSummary.substring(0, 2000) : null;
    const keyTakeaways = validateStringArray(result.keyTakeaways);
    const faqItems = validateFaqItems(result.faqItems);
    const seoTitle = typeof result.seoTitle === "string" ? result.seoTitle.substring(0, 100) : null;
    const seoDescription = typeof result.seoDescription === "string" ? result.seoDescription.substring(0, 200) : null;

    const [updated] = await db
      .update(posts)
      .set({
        aiSummary,
        keyTakeaways,
        faqItems,
        seoTitle,
        seoDescription,
        aiLastReviewed: new Date(),
      })
      .where(eq(posts.id, postId))
      .returning();

    return updated;
  },

  async generateDebateConsensus(debateId: number): Promise<any> {
    if (!debateId || isNaN(debateId)) throw new Error("Valid debateId required");

    const [debate] = await db.select().from(liveDebates).where(eq(liveDebates.id, debateId));
    if (!debate) throw new Error("Debate not found");

    const systemPrompt = `You are a debate analysis expert for a hybrid human-AI discussion platform. Analyze debate transcripts to extract consensus, disagreements, and confidence levels. Be neutral and factual. Return valid JSON.`;

    const userPrompt = `Analyze this debate and generate a consensus report.

Title: ${debate.title}
Topic: ${debate.topic}
Description: ${debate.description || "No description"}
Format: ${debate.format}
Status: ${debate.status}
Rounds completed: ${debate.currentRound} / ${debate.totalRounds}

Generate a consensus analysis. Return JSON with:
{
  "consensusSummary": "A neutral 3-4 sentence summary of the points where participants agreed",
  "disagreementSummary": "A 2-3 sentence summary of the main disagreements and opposing positions",
  "confidenceScore": 0.0 to 1.0 indicating how much consensus was reached (1.0 = full consensus)
}`;

    const raw = await callOpenAI(systemPrompt, userPrompt);
    const result = safeParseJSON(raw);

    if (!result) {
      throw new Error("AI response was not valid JSON");
    }

    const consensusSummary = typeof result.consensusSummary === "string" ? result.consensusSummary.substring(0, 2000) : null;
    const disagreementSummary = typeof result.disagreementSummary === "string" ? result.disagreementSummary.substring(0, 2000) : null;
    const confidenceScore = Math.max(0, Math.min(1, Number(result.confidenceScore) || 0.5));

    const [updated] = await db
      .update(liveDebates)
      .set({
        consensusSummary,
        disagreementSummary,
        confidenceScore,
      })
      .where(eq(liveDebates.id, debateId))
      .returning();

    return updated;
  },

  async batchGeneratePostSEO(limit: number = 10): Promise<{ processed: number; errors: number }> {
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));

    const postsWithoutSummary = await db
      .select({ id: posts.id })
      .from(posts)
      .where(isNull(posts.aiLastReviewed))
      .limit(safeLimit);

    let processed = 0;
    let errors = 0;

    for (const post of postsWithoutSummary) {
      try {
        await this.generatePostSEO(post.id);
        processed++;
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[AIContent] Failed to process post ${post.id}:`, err);
        errors++;
      }
    }

    return { processed, errors };
  },
};
