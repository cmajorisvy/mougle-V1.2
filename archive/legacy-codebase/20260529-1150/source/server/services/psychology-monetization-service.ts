import { db } from "../db";
import { monetizationEvents, userPsychologyProfiles, userSubscriptions, subscriptionPlans, users as usersTable } from "@shared/schema";
import { eq, sql, desc, gte, and, count } from "drizzle-orm";

type TriggerType = "memory_limit" | "advanced_reasoning" | "voice_access" | "agent_training" | "marketplace_publish";
type PsychologyStage = "curious" | "exploring" | "engaged" | "invested" | "habitual" | "advocate" | "dependent";

interface FeatureGate {
  feature: string;
  requiredPlan: string;
  creditsCost: number;
  description: string;
  triggerType: TriggerType;
}

const FEATURE_GATES: Record<string, FeatureGate> = {
  expanded_memory: {
    feature: "expanded_memory",
    requiredPlan: "pro",
    creditsCost: 0,
    description: "Save more than 10 memories for personalized AI",
    triggerType: "memory_limit",
  },
  voice_interaction: {
    feature: "voice_interaction",
    requiredPlan: "pro",
    creditsCost: 5,
    description: "Voice conversations with your AI assistant",
    triggerType: "voice_access",
  },
  advanced_reasoning: {
    feature: "advanced_reasoning",
    requiredPlan: "pro",
    creditsCost: 10,
    description: "Deep analysis and advanced AI reasoning",
    triggerType: "advanced_reasoning",
  },
  agent_training: {
    feature: "agent_training",
    requiredPlan: "creator",
    creditsCost: 20,
    description: "Train custom AI agents with specialized skills",
    triggerType: "agent_training",
  },
  marketplace_publish: {
    feature: "marketplace_publish",
    requiredPlan: "creator",
    creditsCost: 15,
    description: "Publish agents to the marketplace",
    triggerType: "marketplace_publish",
  },
};

const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  pro: 1,
  creator: 2,
  expert: 3,
};

const FREE_MEMORY_LIMIT = 10;
const PRO_MEMORY_LIMIT = 100;
const CREATOR_MEMORY_LIMIT = 500;

type PromptIntensity = "educate" | "soft" | "strong";

function getPromptIntensity(stage: PsychologyStage): PromptIntensity {
  if (stage === "curious" || stage === "exploring") return "educate";
  if (stage === "engaged" || stage === "invested") return "soft";
  return "strong";
}

interface PromptConfig {
  intensity: PromptIntensity;
  title: string;
  message: string;
  cta: string;
  benefit: string;
}

function getPromptConfig(triggerType: TriggerType, stage: PsychologyStage, requiredPlan: string): PromptConfig {
  const intensity = getPromptIntensity(stage);

  const configs: Record<TriggerType, Record<PromptIntensity, PromptConfig>> = {
    memory_limit: {
      educate: {
        intensity: "educate",
        title: "Your AI Is Learning",
        message: "Your assistant remembers what matters to you. Upgrade to save even more memories and get deeply personalized responses.",
        cta: "Learn About Pro",
        benefit: "Up to 100 personalized memories",
      },
      soft: {
        intensity: "soft",
        title: "Memory Limit Reached",
        message: "You've saved 10 memories — your AI knows you well! Unlock expanded memory to make it even smarter.",
        cta: "Upgrade to Pro",
        benefit: "10x more memory slots",
      },
      strong: {
        intensity: "strong",
        title: "Unlock Full Memory",
        message: "You rely on your AI daily. Don't let memory limits slow you down — upgrade for unlimited personalization.",
        cta: "Go Pro Now",
        benefit: "Unlimited AI memory & personalization",
      },
    },
    advanced_reasoning: {
      educate: {
        intensity: "educate",
        title: "Deeper AI Thinking",
        message: "Want more thorough analysis? Pro unlocks advanced reasoning for complex questions.",
        cta: "See What Pro Offers",
        benefit: "Advanced AI analysis & reasoning",
      },
      soft: {
        intensity: "soft",
        title: "Advanced Reasoning Available",
        message: "Your questions are getting more complex. Upgrade to Pro for deeper, more nuanced AI responses.",
        cta: "Upgrade to Pro",
        benefit: "Expert-level AI analysis",
      },
      strong: {
        intensity: "strong",
        title: "Unlock Expert AI",
        message: "Get the depth of analysis your work deserves. Advanced reasoning is waiting for you.",
        cta: "Activate Pro",
        benefit: "Unlimited advanced reasoning",
      },
    },
    voice_access: {
      educate: {
        intensity: "educate",
        title: "Talk to Your AI",
        message: "Voice conversations make your AI feel like a real assistant. Available with Pro.",
        cta: "Explore Voice Features",
        benefit: "Natural voice conversations",
      },
      soft: {
        intensity: "soft",
        title: "Voice Interaction",
        message: "Ready to have real conversations? Upgrade to Pro to talk with your AI assistant.",
        cta: "Upgrade for Voice",
        benefit: "Hands-free AI interaction",
      },
      strong: {
        intensity: "strong",
        title: "Start Talking",
        message: "Voice is the most natural way to interact. Unlock it now and speak directly with your AI.",
        cta: "Enable Voice Now",
        benefit: "Full voice interaction suite",
      },
    },
    agent_training: {
      educate: {
        intensity: "educate",
        title: "Create Your Own AI",
        message: "With Creator, you can train specialized AI agents for any purpose.",
        cta: "Learn About Creator",
        benefit: "Custom AI agent training",
      },
      soft: {
        intensity: "soft",
        title: "Train Custom Agents",
        message: "You've been using agents effectively. Take the next step — train your own with Creator.",
        cta: "Upgrade to Creator",
        benefit: "Build & train custom AI agents",
      },
      strong: {
        intensity: "strong",
        title: "Become a Creator",
        message: "Your engagement shows you're ready. Build, train, and deploy your own AI agents.",
        cta: "Go Creator",
        benefit: "Full agent training & deployment",
      },
    },
    marketplace_publish: {
      educate: {
        intensity: "educate",
        title: "Share Your Agents",
        message: "Built something great? Creator lets you publish agents to the marketplace.",
        cta: "Learn About Publishing",
        benefit: "Marketplace publishing access",
      },
      soft: {
        intensity: "soft",
        title: "Publish to Marketplace",
        message: "Your agents are ready for the world. Upgrade to Creator to publish and earn.",
        cta: "Upgrade to Creator",
        benefit: "Publish & monetize your agents",
      },
      strong: {
        intensity: "strong",
        title: "Start Earning",
        message: "Publish your agents and start earning credits. Your creations deserve an audience.",
        cta: "Publish Now",
        benefit: "Full marketplace access & earnings",
      },
    },
  };

  return configs[triggerType][intensity];
}

interface GateCheckResult {
  allowed: boolean;
  reason: string | null;
  requiredPlan: string;
  currentPlan: string;
  creditsCost: number;
  canAffordCredits: boolean;
  promptConfig: PromptConfig | null;
  psychologyStage: string;
}

class PsychologyMonetizationService {
  async checkFeatureGate(userId: string, feature: string): Promise<GateCheckResult> {
    const gate = FEATURE_GATES[feature];
    if (!gate) {
      return { allowed: true, reason: null, requiredPlan: "free", currentPlan: "free", creditsCost: 0, canAffordCredits: true, promptConfig: null, psychologyStage: "curious" };
    }

    const [profile] = await db.select().from(userPsychologyProfiles).where(eq(userPsychologyProfiles.userId, userId)).limit(1);
    const psychologyStage = (profile?.psychologyStage || "curious") as PsychologyStage;
    const engagementScore = profile?.engagementScore || 0;

    const [subscription] = await db
      .select({ planName: subscriptionPlans.name })
      .from(userSubscriptions)
      .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
      .limit(1);

    const currentPlan = subscription?.planName || "free";
    const currentLevel = PLAN_HIERARCHY[currentPlan] || 0;
    const requiredLevel = PLAN_HIERARCHY[gate.requiredPlan] || 0;

    const [user] = await db.select({ creditWallet: usersTable.creditWallet }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const balance = user?.creditWallet || 0;
    const canAffordCredits = gate.creditsCost === 0 || balance >= gate.creditsCost;

    const hasAccess = currentLevel >= requiredLevel;

    if (hasAccess && canAffordCredits) {
      return { allowed: true, reason: null, requiredPlan: gate.requiredPlan, currentPlan, creditsCost: gate.creditsCost, canAffordCredits: true, promptConfig: null, psychologyStage };
    }

    const promptConfig = getPromptConfig(gate.triggerType, psychologyStage, gate.requiredPlan);

    await this.logEvent(userId, "prompt_shown", gate.triggerType, psychologyStage, engagementScore, currentPlan, gate.requiredPlan, gate.creditsCost);

    const reason = !hasAccess
      ? `Requires ${gate.requiredPlan} plan`
      : `Insufficient credits (need ${gate.creditsCost})`;

    return {
      allowed: false,
      reason,
      requiredPlan: gate.requiredPlan,
      currentPlan,
      creditsCost: gate.creditsCost,
      canAffordCredits,
      promptConfig,
      psychologyStage,
    };
  }

  async checkMemoryLimit(userId: string, currentMemoryCount: number): Promise<GateCheckResult & { memoryLimit: number }> {
    const [subscription] = await db
      .select({ planName: subscriptionPlans.name })
      .from(userSubscriptions)
      .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
      .limit(1);

    const currentPlan = subscription?.planName || "free";
    const memLimit = currentPlan === "free" ? FREE_MEMORY_LIMIT : currentPlan === "creator" ? CREATOR_MEMORY_LIMIT : PRO_MEMORY_LIMIT;

    if (currentMemoryCount < memLimit) {
      return { allowed: true, reason: null, requiredPlan: "pro", currentPlan, creditsCost: 0, canAffordCredits: true, promptConfig: null, psychologyStage: "curious", memoryLimit: memLimit };
    }

    const gateResult = await this.checkFeatureGate(userId, "expanded_memory");
    return { ...gateResult, memoryLimit: memLimit };
  }

  async logEvent(userId: string, eventType: string, triggerType: string, psychologyStage: string, engagementScore: number, currentPlan: string, suggestedPlan?: string, creditsCost?: number, converted = false, metadata?: Record<string, any>) {
    await db.insert(monetizationEvents).values({
      userId,
      eventType,
      triggerType,
      psychologyStage,
      engagementScore,
      currentPlan,
      suggestedPlan: suggestedPlan || null,
      creditsCost: creditsCost || null,
      converted,
      metadata: metadata || {},
    });
  }

  async logConversion(userId: string, triggerType: string, convertedPlan: string) {
    const [profile] = await db.select().from(userPsychologyProfiles).where(eq(userPsychologyProfiles.userId, userId)).limit(1);
    const stage = profile?.psychologyStage || "curious";
    const score = profile?.engagementScore || 0;

    const [subscription] = await db
      .select({ planName: subscriptionPlans.name })
      .from(userSubscriptions)
      .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
      .limit(1);
    const previousPlan = subscription?.planName || "free";

    await this.logEvent(userId, "conversion", triggerType, stage, score, previousPlan, convertedPlan, undefined, true, { previousPlan, convertedPlan });
  }

  getFeatureGates() {
    return Object.values(FEATURE_GATES);
  }

  getTierInfo() {
    return {
      free: {
        name: "Free",
        features: ["Basic assistant conversations", "Up to 10 saved memories", "5 AI responses/day", "Community access"],
        memoryLimit: FREE_MEMORY_LIMIT,
        price: 0,
      },
      pro: {
        name: "Pro",
        features: ["Expanded memory (100 slots)", "Voice interaction", "Advanced reasoning", "25 AI responses/day", "Priority support"],
        memoryLimit: PRO_MEMORY_LIMIT,
        price: 2900,
      },
      creator: {
        name: "Creator",
        features: ["Everything in Pro", "Agent training", "Marketplace publishing", "500 memory slots", "Unlimited AI responses"],
        memoryLimit: CREATOR_MEMORY_LIMIT,
        price: 7900,
      },
    };
  }

  async getConversionAnalytics() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const events = await db.select().from(monetizationEvents).where(gte(monetizationEvents.createdAt, thirtyDaysAgo)).orderBy(desc(monetizationEvents.createdAt));

    const promptsShown = events.filter(e => e.eventType === "prompt_shown");
    const conversions = events.filter(e => e.eventType === "conversion");
    const promptClicks = events.filter(e => e.eventType === "prompt_clicked");

    const conversionsByStage: Record<string, { prompts: number; clicks: number; conversions: number; rate: number }> = {};
    const stages = ["curious", "exploring", "engaged", "invested", "habitual", "advocate", "dependent"];
    for (const stage of stages) {
      const stagePrompts = promptsShown.filter(e => e.psychologyStage === stage).length;
      const stageClicks = promptClicks.filter(e => e.psychologyStage === stage).length;
      const stageConversions = conversions.filter(e => e.psychologyStage === stage).length;
      conversionsByStage[stage] = {
        prompts: stagePrompts,
        clicks: stageClicks,
        conversions: stageConversions,
        rate: stagePrompts > 0 ? Math.round((stageConversions / stagePrompts) * 10000) / 100 : 0,
      };
    }

    const conversionsByTrigger: Record<string, { prompts: number; conversions: number; rate: number }> = {};
    const triggers = ["memory_limit", "advanced_reasoning", "voice_access", "agent_training", "marketplace_publish"];
    for (const trigger of triggers) {
      const trigPrompts = promptsShown.filter(e => e.triggerType === trigger).length;
      const trigConversions = conversions.filter(e => e.triggerType === trigger).length;
      conversionsByTrigger[trigger] = {
        prompts: trigPrompts,
        conversions: trigConversions,
        rate: trigPrompts > 0 ? Math.round((trigConversions / trigPrompts) * 10000) / 100 : 0,
      };
    }

    const avgEngagementAtConversion = conversions.length > 0
      ? Math.round((conversions.reduce((sum, e) => sum + e.engagementScore, 0) / conversions.length) * 10) / 10
      : 0;

    const conversionTimeline: { date: string; prompts: number; conversions: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      conversionTimeline.push({
        date: dateStr,
        prompts: events.filter(e => e.eventType === "prompt_shown" && e.createdAt && e.createdAt.toISOString().startsWith(dateStr)).length,
        conversions: events.filter(e => e.eventType === "conversion" && e.createdAt && e.createdAt.toISOString().startsWith(dateStr)).length,
      });
    }

    return {
      totalPromptsShown: promptsShown.length,
      totalPromptClicks: promptClicks.length,
      totalConversions: conversions.length,
      overallConversionRate: promptsShown.length > 0 ? Math.round((conversions.length / promptsShown.length) * 10000) / 100 : 0,
      clickThroughRate: promptsShown.length > 0 ? Math.round((promptClicks.length / promptsShown.length) * 10000) / 100 : 0,
      avgEngagementAtConversion,
      conversionsByStage,
      conversionsByTrigger,
      conversionTimeline,
      recentEvents: events.slice(0, 20),
    };
  }
}

export const psychologyMonetizationService = new PsychologyMonetizationService();
