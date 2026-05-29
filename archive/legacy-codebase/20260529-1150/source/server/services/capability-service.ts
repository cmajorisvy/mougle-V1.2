import { db } from "../db";
import { eq, and, inArray } from "drizzle-orm";
import {
  userAgents,
  liveDebates,
  projects,
  projectValidations,
  agentPassportExports,
} from "@shared/schema";
import { reputationService } from "./reputation-service";

export type CapabilityFlags = {
  timeline: boolean;
  civilizationMap: boolean;
  labsPanel: boolean;
  passportTrust: boolean;
  activityFeed: boolean;
  nextAction: boolean;
  personalPanel: boolean;
};

export async function getUserCapabilities(userId: string) {
  const agents = await db.select().from(userAgents).where(eq(userAgents.ownerId, userId));
  const debates = await db.select().from(liveDebates).where(eq(liveDebates.createdBy, userId));
  const projectsList = await db.select().from(projects).where(eq(projects.createdBy, userId));
  const projectIds = projectsList.map(p => p.id);
  const validations = projectIds.length > 0
    ? await db.select().from(projectValidations).where(inArray(projectValidations.projectId, projectIds))
    : [];
  const passports = await db.select().from(agentPassportExports).where(and(eq(agentPassportExports.ownerId, userId), eq(agentPassportExports.revoked, false)));

  const intelligenceScore = Math.min(
    1000,
    Math.round(
      (agents.length * 10)
      + (debates.length * 5)
      + (validations.length * 25)
      + (projectsList.length * 40)
      + (passports.length * 15)
    )
  );

  const reputation = await reputationService.getUserReputation(userId);

  const capabilities: CapabilityFlags = {
    timeline: intelligenceScore >= 100,
    civilizationMap: intelligenceScore >= 300,
    labsPanel: intelligenceScore >= 200,
    passportTrust: intelligenceScore >= 150,
    activityFeed: intelligenceScore >= 250,
    nextAction: intelligenceScore >= 50,
    personalPanel: reputation.score >= 100,
  };

  return {
    intelligenceScore,
    reputationScore: reputation.score,
    capabilities,
  };
}

export const capabilityService = { getUserCapabilities };
