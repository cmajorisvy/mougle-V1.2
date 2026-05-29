import { posts, liveDebates } from "@shared/schema";

export interface SEOMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  ogType: string;
  ogImage?: string;
  twitterCard: "summary" | "summary_large_image";
  schemaData?: any;
}

const BASE_URL = process.env.PUBLIC_URL || "https://www.mougle.com";

export const generatePostMetadata = (post: typeof posts.$inferSelect): SEOMetadata => {
  const title = `${post.seoTitle || post.title} | Mougle`;
  const description = post.seoDescription || post.aiSummary || post.content.substring(0, 155) + "...";

  const faqSchema = (post.faqItems && Array.isArray(post.faqItems) && post.faqItems.length > 0) ? {
    "@type": "FAQPage",
    "mainEntity": (post.faqItems as { question: string; answer: string }[]).map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer,
      },
    })),
  } : null;

  const schemaData: any = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "DiscussionForumPosting",
        "@id": `${BASE_URL}/post/${post.id}`,
        "headline": post.title,
        "articleBody": post.content,
        "abstract": post.aiSummary || undefined,
        "author": { "@type": "Person", "name": "User " + post.authorId },
        "datePublished": post.createdAt,
        "dateModified": post.aiLastReviewed || post.createdAt,
        "publisher": {
          "@type": "Organization",
          "name": "Mougle",
          "url": BASE_URL,
        },
        "isPartOf": {
          "@type": "WebSite",
          "name": "Mougle — Where Intelligence Evolves",
          "url": BASE_URL,
        },
        "about": {
          "@type": "Thing",
          "name": post.topicSlug,
        },
        "keywords": post.topicSlug,
        "interactionStatistic": {
          "@type": "InteractionCounter",
          "interactionType": "https://schema.org/LikeAction",
          "userInteractionCount": post.likes,
        },
      },
    ],
  };

  if (post.keyTakeaways && post.keyTakeaways.length > 0) {
    schemaData["@graph"][0]["description"] = post.keyTakeaways.join(". ");
  }

  if (post.verificationScore && post.verificationScore > 0) {
    schemaData["@graph"][0]["review"] = {
      "@type": "Review",
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": Math.round(post.verificationScore * 100),
        "bestRating": 100,
        "worstRating": 0,
      },
      "author": {
        "@type": "Organization",
        "name": "Mougle Trust Engine",
      },
    };
  }

  if (faqSchema) {
    schemaData["@graph"].push(faqSchema);
  }

  return {
    title,
    description,
    canonicalUrl: `${BASE_URL}/post/${post.id}`,
    ogType: "article",
    ogImage: post.image || undefined,
    twitterCard: post.image ? "summary_large_image" : "summary",
    schemaData,
  };
};

export const generateDebateMetadata = (debate: typeof liveDebates.$inferSelect): SEOMetadata => {
  const title = `${debate.title} | Mougle`;
  const description = debate.consensusSummary || debate.description?.substring(0, 155) || "Live AI-Human Debate on " + debate.topic;

  const schemaData: any = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Event",
        "@id": `${BASE_URL}/debates/${debate.id}`,
        "name": debate.title,
        "description": debate.consensusSummary || debate.description,
        "startDate": debate.startedAt || debate.createdAt,
        "endDate": debate.endedAt || undefined,
        "eventStatus": debate.status === "ended" ? "https://schema.org/EventEnded" : "https://schema.org/EventScheduled",
        "organizer": {
          "@type": "Organization",
          "name": "Mougle",
          "url": BASE_URL,
        },
        "about": {
          "@type": "Thing",
          "name": debate.topic,
        },
        "location": {
          "@type": "VirtualLocation",
          "url": `${BASE_URL}/debates/${debate.id}`,
        },
      },
    ],
  };

  if (debate.confidenceScore && debate.confidenceScore > 0) {
    schemaData["@graph"][0]["review"] = {
      "@type": "Review",
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": Math.round(debate.confidenceScore * 100),
        "bestRating": 100,
        "worstRating": 0,
      },
      "reviewBody": debate.consensusSummary,
      "author": {
        "@type": "Organization",
        "name": "Mougle Consensus Engine",
      },
    };
  }

  if (debate.disagreementSummary) {
    schemaData["@graph"].push({
      "@type": "Comment",
      "text": debate.disagreementSummary,
      "about": { "@type": "Thing", "name": `Disagreements in: ${debate.title}` },
    });
  }

  return {
    title,
    description,
    canonicalUrl: `${BASE_URL}/debates/${debate.id}`,
    ogType: "video.movie",
    twitterCard: "summary_large_image",
    schemaData,
  };
};
