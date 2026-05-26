import { storage } from "../storage";
import OpenAI from "openai";

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

interface CaptionResult {
  caption: string;
  hashtags: string[];
  callToAction: string;
}

const PLATFORM_LIMITS: Record<string, number> = {
  twitter: 280,
  linkedin: 3000,
  facebook: 2000,
  reddit: 300,
  telegram: 4096,
  whatsapp: 1000,
};

async function getContentData(contentType: string, contentId: string): Promise<{ title: string; summary: string; category: string; url: string } | null> {
  if (contentType === "news" || contentType === "breaking") {
    const article = await storage.getNewsArticle(parseInt(contentId));
    if (!article) return null;
    return {
      title: article.title,
      summary: article.summary || article.originalContent || "",
      category: article.category,
      url: `/ai-news-updates/${article.slug || article.id}`,
    };
  }
  if (contentType === "debate") {
    const debate = await storage.getLiveDebate(parseInt(contentId));
    if (!debate) return null;
    return {
      title: debate.title,
      summary: debate.description || "",
      category: debate.topic,
      url: `/debate/${debate.id}`,
    };
  }
  if (contentType === "post" || contentType === "trending") {
    const post = await storage.getPost(contentId);
    if (!post) return null;
    return {
      title: post.title,
      summary: post.content.substring(0, 300),
      category: post.topicSlug,
      url: `/post/${post.id}`,
    };
  }
  return null;
}

export const socialCaptionAgent = {
  async generateCaption(contentType: string, contentId: string, platform?: string): Promise<CaptionResult> {
    const content = await getContentData(contentType, contentId);
    if (!content) {
      return { caption: "", hashtags: [], callToAction: "" };
    }

    const openai = getOpenAIClient();
    if (!openai) {
      const fallbackHashtags = [`#${content.category}`, "#Mougle", "#AI"];
      return {
        caption: `${content.title}\n\n${content.summary.substring(0, 150)}...`,
        hashtags: fallbackHashtags,
        callToAction: "Join the discussion on Mougle!",
      };
    }

    const charLimit = PLATFORM_LIMITS[platform || "twitter"] || 280;
    const contentLabel = contentType === "breaking" ? "BREAKING NEWS" :
      contentType === "debate" ? "LIVE DEBATE" :
      contentType === "trending" ? "TRENDING" : "NEWS";

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-5.5",
        messages: [
          {
            role: "system",
            content: `You are a social media content expert for Mougle, a hybrid human-AI discussion platform. Generate engaging social media content.

Return ONLY valid JSON with these fields:
- "caption": An engaging caption (max ${charLimit} chars) for ${platform || "social media"}. Include the content label "${contentLabel}" if relevant. Make it attention-grabbing but professional.
- "hashtags": Array of 5-8 relevant hashtags (without # prefix)
- "callToAction": A compelling call-to-action (1 sentence)

Platform: ${platform || "general"}
Character limit: ${charLimit}`
          },
          {
            role: "user",
            content: `Content type: ${contentType}\nTitle: ${content.title}\nSummary: ${content.summary.substring(0, 500)}\nCategory: ${content.category}`
          }
        ],
        max_completion_tokens: 500,
      });

      const text = completion.choices[0]?.message?.content?.trim() || "";
      const cleanJson = text.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(cleanJson);
      return {
        caption: parsed.caption || content.title,
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
        callToAction: parsed.callToAction || "Join the discussion on Mougle!",
      };
    } catch (err) {
      console.log(`[SocialCaption] Generation failed:`, (err as Error).message);
      return {
        caption: `${contentLabel}: ${content.title}`,
        hashtags: [content.category, "Mougle", "AI", "Tech"],
        callToAction: "Read more and join the discussion on Mougle!",
      };
    }
  },

  async generateForAllPlatforms(contentType: string, contentId: string): Promise<Record<string, CaptionResult>> {
    const platforms = ["twitter", "linkedin", "facebook", "reddit"];
    const results: Record<string, CaptionResult> = {};
    for (const platform of platforms) {
      results[platform] = await this.generateCaption(contentType, contentId, platform);
      await new Promise(r => setTimeout(r, 300));
    }
    return results;
  },
};
