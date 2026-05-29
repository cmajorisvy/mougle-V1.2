import { db } from "../db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import {
  users,
  liveDebates,
  projects,
  projectValidations,
  projectPackagePurchases,
  agentPassportExports,
  expertiseTags,
  reputationHistory,
} from "@shared/schema";

type ReputationBreakdown = {
  debates: number;
  validations: number;
  projects: number;
  purchases: number;
  passports: number;
};

type ReputationResult = {
  score: number;
  level: string;
  breakdown: ReputationBreakdown;
};

const WEIGHTS = {
  debates: 5,
  validations: 25,
  projects: 40,
  purchases: 15,
  passports: 15,
};

export async function getUserReputation(userId: string): Promise<ReputationResult> {
  const debates = await db.select().from(liveDebates).where(eq(liveDebates.createdBy, userId));
  const projectsList = await db.select().from(projects).where(eq(projects.createdBy, userId));
  const projectIds = projectsList.map(p => p.id);
  const validations = projectIds.length > 0
    ? await db.select().from(projectValidations).where(inArray(projectValidations.projectId, projectIds))
    : [];
  const purchases = await db.select().from(projectPackagePurchases).where(eq(projectPackagePurchases.buyerId, userId));
  const passports = await db.select().from(agentPassportExports).where(and(eq(agentPassportExports.ownerId, userId), eq(agentPassportExports.revoked, false)));

  const breakdown = {
    debates: debates.length,
    validations: validations.length,
    projects: projectsList.length,
    purchases: purchases.length,
    passports: passports.length,
  };

  const score = Math.min(
    1000,
    Math.round(
      breakdown.debates * WEIGHTS.debates
      + breakdown.validations * WEIGHTS.validations
      + breakdown.projects * WEIGHTS.projects
      + breakdown.purchases * WEIGHTS.purchases
      + breakdown.passports * WEIGHTS.passports
    )
  );

  const level =
    score >= 800 ? "Architect" :
    score >= 600 ? "Strategist" :
    score >= 400 ? "Builder" :
    score >= 200 ? "Explorer" :
    "Initiate";

  return { score, level, breakdown };
}

async function getRanking() {
  const allUsers = await db.select({
    id: users.id,
    username: users.username,
    displayName: users.displayName,
    avatar: users.avatar,
    role: users.role,
    reputation: users.reputation,
    badge: users.badge,
    rankLevel: users.rankLevel,
  }).from(users).orderBy(desc(users.reputation)).limit(50);

  return allUsers;
}

async function upsertExpertiseTag(data: {
  userId: string;
  topicSlug: string;
  tag: string;
  accuracyScore?: number;
}) {
  const existing = await db.select().from(expertiseTags)
    .where(and(eq(expertiseTags.userId, data.userId), eq(expertiseTags.topicSlug, data.topicSlug)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(expertiseTags)
      .set({ tag: data.tag, accuracyScore: data.accuracyScore ?? existing[0].accuracyScore })
      .where(eq(expertiseTags.id, existing[0].id));
    return existing[0];
  }

  const [inserted] = await db.insert(expertiseTags).values({
    userId: data.userId,
    topicSlug: data.topicSlug,
    tag: data.tag,
    accuracyScore: data.accuracyScore ?? 0,
  }).returning();
  return inserted;
}

async function applyVerificationDelta(userId: string, postId: string, score: number) {
  const delta = score > 0.7 ? 10 : score > 0.5 ? 2 : -5;
  await db.update(users)
    .set({ reputation: sql`${users.reputation} + ${delta}` })
    .where(eq(users.id, userId));
  await db.insert(reputationHistory).values({
    userId,
    delta,
    reason: "agent_verification",
    sourcePostId: postId,
  });
}

export const reputationService = { getUserReputation, getRanking, upsertExpertiseTag, applyVerificationDelta };
