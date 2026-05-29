import { db } from "../db";
import { userAgents, agentXpLogs, agentUnlockedSkills, agentSkillNodes, agentCertifications, agentSpecializations } from "@shared/schema";
import { eq, and, sql, gte, desc } from "drizzle-orm";

const XP_SOURCES: Record<string, number> = {
  interaction: 10,
  debate_participation: 25,
  debate_win: 50,
  training_completed: 30,
  marketplace_sale: 20,
  marketplace_purchase_used: 5,
  rating_received: 15,
  positive_rating: 25,
  verification: 15,
  comment: 8,
  post_created: 12,
  knowledge_added: 20,
  certification_earned: 100,
};

const COOLDOWN_MS: Record<string, number> = {
  interaction: 30_000,
  comment: 60_000,
  verification: 60_000,
  rating_received: 300_000,
  post_created: 120_000,
};

const QUALITY_THRESHOLDS: Record<string, number> = {
  interaction: 3,
  comment: 20,
  verification: 10,
  post_created: 30,
};

const recentXpTimestamps = new Map<string, number>();

export function calculateLevel(xp: number): number {
  if (xp <= 0) return 1;
  return Math.min(50, Math.floor(1 + Math.sqrt(xp / 50)));
}

export function xpForLevel(level: number): number {
  return (level - 1) * (level - 1) * 50;
}

export function xpForNextLevel(currentXp: number): { currentLevel: number; nextLevelXp: number; progress: number } {
  const currentLevel = calculateLevel(currentXp);
  const nextLevelXp = xpForLevel(currentLevel + 1);
  const currentLevelXp = xpForLevel(currentLevel);
  const progress = currentLevelXp === nextLevelXp ? 100 : Math.round(((currentXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100);
  return { currentLevel, nextLevelXp, progress: Math.min(100, Math.max(0, progress)) };
}

export async function awardXp(
  agentId: string,
  source: string,
  metadata?: Record<string, any>,
  contentLength?: number
): Promise<{ xpAwarded: number; newXp: number; newLevel: number; leveledUp: boolean } | null> {
  const baseXp = XP_SOURCES[source];
  if (!baseXp) return null;

  const cooldownKey = `${agentId}:${source}`;
  const lastTime = recentXpTimestamps.get(cooldownKey);
  const cooldown = COOLDOWN_MS[source] || 10_000;
  if (lastTime && Date.now() - lastTime < cooldown) {
    return null;
  }

  const qualityMin = QUALITY_THRESHOLDS[source];
  if (qualityMin && contentLength !== undefined && contentLength < qualityMin) {
    return null;
  }

  recentXpTimestamps.set(cooldownKey, Date.now());

  const xpAmount = baseXp;

  const [agent] = await db.select({ xp: userAgents.xp, level: userAgents.level })
    .from(userAgents)
    .where(eq(userAgents.id, agentId));

  if (!agent) return null;

  const oldLevel = agent.level;
  const newXp = (agent.xp || 0) + xpAmount;
  const newLevel = calculateLevel(newXp);
  const leveledUp = newLevel > oldLevel;

  await db.update(userAgents)
    .set({ xp: newXp, level: newLevel, updatedAt: new Date() })
    .where(eq(userAgents.id, agentId));

  await db.insert(agentXpLogs).values({
    agentId,
    source,
    xpAmount,
    metadata: metadata || {},
  });

  return { xpAwarded: xpAmount, newXp, newLevel, leveledUp };
}

export async function getAgentProgression(agentId: string) {
  const [agent] = await db.select({
    id: userAgents.id,
    name: userAgents.name,
    xp: userAgents.xp,
    level: userAgents.level,
    industrySlug: userAgents.industrySlug,
    specializationSlug: userAgents.specializationSlug,
  }).from(userAgents).where(eq(userAgents.id, agentId));

  if (!agent) return null;

  const progression = xpForNextLevel(agent.xp || 0);

  const unlockedSkills = await db.select()
    .from(agentUnlockedSkills)
    .where(eq(agentUnlockedSkills.agentId, agentId));

  const certifications = await db.select()
    .from(agentCertifications)
    .where(eq(agentCertifications.agentId, agentId));

  const recentXp = await db.select()
    .from(agentXpLogs)
    .where(eq(agentXpLogs.agentId, agentId))
    .orderBy(desc(agentXpLogs.createdAt))
    .limit(20);

  let skillTree: any[] = [];
  if (agent.industrySlug) {
    skillTree = await db.select()
      .from(agentSkillNodes)
      .where(eq(agentSkillNodes.industrySlug, agent.industrySlug));
  }

  const unlockedSlugs = new Set(unlockedSkills.map(s => s.skillSlug));

  const skillTreeWithStatus = skillTree.map(node => ({
    ...node,
    unlocked: unlockedSlugs.has(node.slug),
    canUnlock: !unlockedSlugs.has(node.slug) &&
      (agent.level || 1) >= node.levelRequired &&
      (agent.xp || 0) >= node.xpCost &&
      (!node.prerequisiteSlugs?.length || node.prerequisiteSlugs.every((p: string) => unlockedSlugs.has(p))),
  }));

  const specialization = agent.industrySlug ? await db.select()
    .from(agentSpecializations)
    .where(eq(agentSpecializations.agentId, agentId))
    .limit(1) : [];

  return {
    agentId: agent.id,
    name: agent.name,
    xp: agent.xp || 0,
    level: agent.level || 1,
    ...progression,
    industrySlug: agent.industrySlug,
    specializationSlug: agent.specializationSlug,
    unlockedSkills: unlockedSkills.map(s => s.skillSlug),
    skillTree: skillTreeWithStatus,
    certifications,
    recentXp,
    specialization: specialization[0] || null,
    totalSkillsUnlocked: unlockedSkills.length,
    totalCertifications: certifications.length,
  };
}

export async function unlockSkill(agentId: string, skillSlug: string): Promise<{ success: boolean; error?: string }> {
  const [agent] = await db.select({
    xp: userAgents.xp,
    level: userAgents.level,
    industrySlug: userAgents.industrySlug,
  }).from(userAgents).where(eq(userAgents.id, agentId));

  if (!agent) return { success: false, error: "Agent not found" };

  const [skill] = await db.select()
    .from(agentSkillNodes)
    .where(eq(agentSkillNodes.slug, skillSlug));

  if (!skill) return { success: false, error: "Skill not found" };

  if (agent.industrySlug !== skill.industrySlug) {
    return { success: false, error: "Skill is not in agent's industry" };
  }

  const existing = await db.select()
    .from(agentUnlockedSkills)
    .where(and(eq(agentUnlockedSkills.agentId, agentId), eq(agentUnlockedSkills.skillSlug, skillSlug)));

  if (existing.length > 0) return { success: false, error: "Skill already unlocked" };

  if ((agent.level || 1) < skill.levelRequired) {
    return { success: false, error: `Requires level ${skill.levelRequired}` };
  }

  if ((agent.xp || 0) < skill.xpCost) {
    return { success: false, error: `Requires ${skill.xpCost} XP` };
  }

  if (skill.prerequisiteSlugs?.length) {
    const unlocked = await db.select({ slug: agentUnlockedSkills.skillSlug })
      .from(agentUnlockedSkills)
      .where(eq(agentUnlockedSkills.agentId, agentId));
    const unlockedSet = new Set(unlocked.map(u => u.slug));
    const missing = skill.prerequisiteSlugs.filter((p: string) => !unlockedSet.has(p));
    if (missing.length > 0) {
      return { success: false, error: `Missing prerequisites: ${missing.join(", ")}` };
    }
  }

  await db.insert(agentUnlockedSkills).values({ agentId, skillSlug });

  return { success: true };
}

export async function getSkillEffects(agentId: string): Promise<Record<string, number>> {
  const unlocked = await db.select({ skillSlug: agentUnlockedSkills.skillSlug })
    .from(agentUnlockedSkills)
    .where(eq(agentUnlockedSkills.agentId, agentId));

  if (unlocked.length === 0) return {};

  const slugs = unlocked.map(u => u.skillSlug);
  const skills = await db.select()
    .from(agentSkillNodes)
    .where(sql`${agentSkillNodes.slug} = ANY(${slugs})`);

  const effects: Record<string, number> = {};
  for (const s of skills) {
    if (s.effectKey && s.effectValue) {
      effects[s.effectKey] = (effects[s.effectKey] || 1) * s.effectValue;
    }
  }
  return effects;
}

export async function grantCertification(
  agentId: string,
  industrySlug: string,
  certSlug: string,
  name: string,
  description: string,
  badge: string = "verified",
  rankBoost: number = 10
): Promise<boolean> {
  const existing = await db.select()
    .from(agentCertifications)
    .where(and(eq(agentCertifications.agentId, agentId), eq(agentCertifications.certSlug, certSlug)));

  if (existing.length > 0) return false;

  await db.insert(agentCertifications).values({
    agentId, industrySlug, certSlug, name, description, badge, rankBoost,
  });

  await awardXp(agentId, "certification_earned", { certSlug });
  return true;
}

export async function checkAndGrantCertifications(agentId: string): Promise<string[]> {
  const [agent] = await db.select({
    level: userAgents.level,
    industrySlug: userAgents.industrySlug,
    totalUsageCount: userAgents.totalUsageCount,
    rating: userAgents.rating,
    ratingCount: userAgents.ratingCount,
  }).from(userAgents).where(eq(userAgents.id, agentId));

  if (!agent || !agent.industrySlug) return [];

  const granted: string[] = [];
  const ind = agent.industrySlug;

  if ((agent.level || 1) >= 5) {
    const ok = await grantCertification(agentId, ind, `${ind}-proficient`, `${ind} Proficient`, `Reached level 5 in ${ind}`, "star", 15);
    if (ok) granted.push(`${ind}-proficient`);
  }

  if ((agent.level || 1) >= 10) {
    const ok = await grantCertification(agentId, ind, `${ind}-expert`, `${ind} Expert`, `Reached level 10 in ${ind}`, "shield", 25);
    if (ok) granted.push(`${ind}-expert`);
  }

  if ((agent.totalUsageCount || 0) >= 100) {
    const ok = await grantCertification(agentId, ind, `${ind}-reliable`, `Reliable Agent`, `100+ successful interactions`, "check", 10);
    if (ok) granted.push(`${ind}-reliable`);
  }

  if ((agent.rating || 0) >= 4.5 && (agent.ratingCount || 0) >= 10) {
    const ok = await grantCertification(agentId, ind, `${ind}-top-rated`, `Top Rated`, `4.5+ rating with 10+ reviews`, "award", 20);
    if (ok) granted.push(`${ind}-top-rated`);
  }

  return granted;
}

export const agentProgressionService = {
  awardXp,
  getAgentProgression,
  unlockSkill,
  getSkillEffects,
  grantCertification,
  checkAndGrantCertifications,
  calculateLevel,
  xpForLevel,
  xpForNextLevel,
  XP_SOURCES,
};
