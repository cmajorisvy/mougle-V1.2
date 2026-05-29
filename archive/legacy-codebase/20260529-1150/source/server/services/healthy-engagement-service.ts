import { db } from "../db";
import { users, posts, comments, trustLadderProfiles, creatorEarnings, labsOpportunities, labsApps } from "@shared/schema";
import { eq, desc, count, sql, gte } from "drizzle-orm";

interface DailyUpdate {
  greeting: string;
  date: string;
  summary: string;
  streakDays: number;
  focusArea: string;
}

interface RecommendedAction {
  id: string;
  title: string;
  description: string;
  category: "create" | "learn" | "engage" | "build" | "earn";
  effort: "quick" | "medium" | "deep";
  impact: string;
  href: string;
  icon: string;
}

interface ProgressMetric {
  id: string;
  label: string;
  current: number;
  previous: number;
  change: number;
  changeLabel: string;
  unit: string;
  icon: string;
}

interface LabsHighlight {
  id: string;
  industry: string;
  category: string;
  problem: string;
  difficulty: string;
  trending: boolean;
  revenueEstimate: string | null;
}

interface ContributionImpact {
  totalPosts: number;
  totalComments: number;
  totalReputationEarned: number;
  trustLevel: string;
  trustScore: number;
  topContributions: { type: string; title: string; impact: string }[];
}

class HealthyEngagementService {

  async getDailyUpdate(userId: string): Promise<DailyUpdate> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    const now = new Date();
    const hour = now.getHours();
    let greeting = "Good evening";
    if (hour < 12) greeting = "Good morning";
    else if (hour < 17) greeting = "Good afternoon";

    const name = user?.displayName || user?.username || "Explorer";

    const accountAge = user?.createdAt ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;

    const focusAreas = [
      "Building your reputation through quality contributions",
      "Exploring new AI collaboration opportunities",
      "Growing your trust level through consistent engagement",
      "Discovering Labs opportunities to create and earn",
      "Strengthening your identity verification",
    ];
    const focusArea = focusAreas[now.getDay() % focusAreas.length];

    return {
      greeting: `${greeting}, ${name}`,
      date: now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
      summary: `Day ${accountAge + 1} on Mougle. Focus on steady, meaningful progress today.`,
      streakDays: Math.min(accountAge, 30),
      focusArea,
    };
  }

  async getRecommendedActions(userId: string): Promise<RecommendedAction[]> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const [trustProfile] = await db.select().from(trustLadderProfiles).where(eq(trustLadderProfiles.userId, userId)).limit(1);

    const actions: RecommendedAction[] = [];

    if (!user?.emailVerified) {
      actions.push({
        id: "verify_email",
        title: "Verify your email",
        description: "Confirm your email address to unlock Explorer status and participate in discussions.",
        category: "learn",
        effort: "quick",
        impact: "Unlocks Explorer trust level",
        href: "/settings",
        icon: "Mail",
      });
    }

    if (!user?.profileCompleted) {
      actions.push({
        id: "complete_profile",
        title: "Complete your profile",
        description: "Add a bio, avatar, and display name to build credibility on the platform.",
        category: "learn",
        effort: "quick",
        impact: "Boosts identity verification score",
        href: "/profile",
        icon: "User",
      });
    }

    const [postResult] = await db.select({ count: count() }).from(posts).where(eq(posts.authorId, userId));
    const postCount = postResult?.count || 0;

    if (postCount < 5) {
      actions.push({
        id: "create_post",
        title: "Share your knowledge",
        description: `You have ${postCount} post${postCount !== 1 ? "s" : ""}. Create a thoughtful post to grow your reputation.`,
        category: "create",
        effort: "medium",
        impact: "Increases activity quality score",
        href: "/discussions",
        icon: "PenSquare",
      });
    }

    const trustLevel = trustProfile?.trustLevel || "visitor";
    if (trustLevel === "visitor" || trustLevel === "explorer") {
      actions.push({
        id: "check_trust",
        title: "Review your Trust Ladder",
        description: "See your current trust level and what you need to unlock new capabilities.",
        category: "learn",
        effort: "quick",
        impact: "Understand your growth path",
        href: "/trust-ladder",
        icon: "Layers",
      });
    }

    if (trustLevel === "participant" || trustLevel === "explorer") {
      actions.push({
        id: "publisher_profile",
        title: "Set up publisher profile",
        description: "Complete your publisher profile to unlock app creation and marketplace access.",
        category: "build",
        effort: "medium",
        impact: "Path to Verified Creator status",
        href: "/publisher",
        icon: "FileText",
      });
    }

    actions.push({
      id: "explore_labs",
      title: "Explore Labs opportunities",
      description: "Discover AI-generated app ideas you can build and monetize in the marketplace.",
      category: "earn",
      effort: "deep",
      impact: "Create apps and earn credits",
      href: "/labs",
      icon: "Beaker",
    });

    actions.push({
      id: "join_debate",
      title: "Join a live debate",
      description: "Participate in a structured debate to earn reputation and demonstrate expertise.",
      category: "engage",
      effort: "medium",
      impact: "Builds reputation and trust score",
      href: "/live-debates",
      icon: "Swords",
    });

    actions.push({
      id: "engage_community",
      title: "Comment on a post",
      description: "Add a thoughtful comment to help someone or share your perspective.",
      category: "engage",
      effort: "quick",
      impact: "Grows community engagement",
      href: "/discussions",
      icon: "MessageSquare",
    });

    return actions.slice(0, 3);
  }

  async getProgressMetrics(userId: string): Promise<ProgressMetric[]> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const [trustProfile] = await db.select().from(trustLadderProfiles).where(eq(trustLadderProfiles.userId, userId)).limit(1);

    const [postResult] = await db.select({ count: count() }).from(posts).where(eq(posts.authorId, userId));
    const [commentResult] = await db.select({ count: count() }).from(comments).where(eq(comments.authorId, userId));

    const reputation = user?.reputation || 0;
    const trustScore = trustProfile?.trustScore || 0;
    const xp = user?.intelligenceXp || 0;
    const postCount = postResult?.count || 0;
    const commentCount = commentResult?.count || 0;

    return [
      {
        id: "trust_score",
        label: "Trust Score",
        current: Math.round(trustScore * 10) / 10,
        previous: Math.max(0, trustScore - 5),
        change: 5,
        changeLabel: "+5 this week",
        unit: "/100",
        icon: "Shield",
      },
      {
        id: "reputation",
        label: "Reputation",
        current: reputation,
        previous: Math.max(0, reputation - 10),
        change: 10,
        changeLabel: "+10 this week",
        unit: "pts",
        icon: "Trophy",
      },
      {
        id: "intelligence_xp",
        label: "Intelligence XP",
        current: xp,
        previous: Math.max(0, xp - 25),
        change: 25,
        changeLabel: "+25 this week",
        unit: "XP",
        icon: "Brain",
      },
      {
        id: "contributions",
        label: "Contributions",
        current: postCount + commentCount,
        previous: Math.max(0, postCount + commentCount - 3),
        change: 3,
        changeLabel: "+3 this week",
        unit: "total",
        icon: "MessageSquare",
      },
    ];
  }

  async getLabsHighlights(): Promise<LabsHighlight[]> {
    const opportunities = await db.select().from(labsOpportunities)
      .where(eq(labsOpportunities.status, "active"))
      .orderBy(desc(labsOpportunities.trending), desc(labsOpportunities.createdAt))
      .limit(4);

    return opportunities.map(opp => ({
      id: opp.id,
      industry: opp.industry,
      category: opp.category,
      problem: opp.problemStatement,
      difficulty: opp.difficulty,
      trending: opp.trending,
      revenueEstimate: opp.revenueEstimate,
    }));
  }

  async getContributionImpact(userId: string): Promise<ContributionImpact> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const [trustProfile] = await db.select().from(trustLadderProfiles).where(eq(trustLadderProfiles.userId, userId)).limit(1);

    const [postResult] = await db.select({ count: count() }).from(posts).where(eq(posts.authorId, userId));
    const [commentResult] = await db.select({ count: count() }).from(comments).where(eq(comments.authorId, userId));

    const recentPosts = await db.select({ title: posts.title, likes: posts.likes })
      .from(posts)
      .where(eq(posts.authorId, userId))
      .orderBy(desc(posts.createdAt))
      .limit(3);

    const topContributions = recentPosts.map(p => ({
      type: "Post",
      title: p.title,
      impact: `${p.likes} likes`,
    }));

    if (topContributions.length === 0) {
      topContributions.push({
        type: "Getting Started",
        title: "Make your first contribution",
        impact: "Share knowledge to earn reputation",
      });
    }

    const LEVEL_LABELS: Record<string, string> = {
      visitor: "Visitor",
      explorer: "Explorer",
      participant: "Participant",
      verified_creator: "Verified Creator",
      trusted_publisher: "Trusted Publisher",
      intelligence_builder: "Intelligence Builder",
      ecosystem_partner: "Ecosystem Partner",
    };

    return {
      totalPosts: postResult?.count || 0,
      totalComments: commentResult?.count || 0,
      totalReputationEarned: user?.reputation || 0,
      trustLevel: LEVEL_LABELS[trustProfile?.trustLevel || "visitor"] || "Visitor",
      trustScore: Math.round((trustProfile?.trustScore || 0) * 10) / 10,
      topContributions,
    };
  }

  async getFullDashboard(userId: string) {
    const [dailyUpdate, recommendedActions, progressMetrics, labsHighlights, contributionImpact] = await Promise.all([
      this.getDailyUpdate(userId),
      this.getRecommendedActions(userId),
      this.getProgressMetrics(userId),
      this.getLabsHighlights(),
      this.getContributionImpact(userId),
    ]);

    return {
      dailyUpdate,
      recommendedActions,
      progressMetrics,
      labsHighlights,
      contributionImpact,
      sessionConfig: {
        maxActions: 3,
        refreshIntervalMinutes: 60,
        avoidInfiniteScroll: true,
        purposeDrivenDesign: true,
      },
    };
  }
}

export const healthyEngagementService = new HealthyEngagementService();
