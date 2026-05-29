import { db } from "../db";
import { eq } from "drizzle-orm";
import { liveDebates, projects, agentPassportExports } from "@shared/schema";
import { reputationService } from "./reputation-service";

type JourneyStage = "Initiate" | "Explorer" | "Builder" | "Strategist" | "Architect";

export async function getUserJourney(userId: string) {
  const reputation = await reputationService.getUserReputation(userId);
  const debates = await db.select().from(liveDebates).where(eq(liveDebates.createdBy, userId));
  const projectsList = await db.select().from(projects).where(eq(projects.createdBy, userId));
  const passports = await db.select().from(agentPassportExports).where(eq(agentPassportExports.ownerId, userId));

  let stage: JourneyStage = "Initiate";
  let nextGoal = "Start your first debate to generate intelligence.";

  if (reputation.score >= 800) {
    stage = "Architect";
    nextGoal = "Lead council reviews and expand the intelligence graph.";
  } else if (reputation.score >= 600) {
    stage = "Strategist";
    nextGoal = "Publish more labs apps to grow marketplace influence.";
  } else if (reputation.score >= 400) {
    stage = "Builder";
    nextGoal = "Convert validated ideas into labs projects.";
  } else if (reputation.score >= 200) {
    stage = "Explorer";
    nextGoal = "Export a passport to unlock cross-platform impact.";
  }

  if (stage === "Initiate" && debates.length > 0) {
    nextGoal = "Generate your first project blueprint from a debate.";
  }
  if (stage === "Explorer" && projectsList.length > 0 && passports.length === 0) {
    nextGoal = "Export your first passport for your projects.";
  }

  return {
    stage,
    nextGoal,
    reputation: reputation.score,
  };
}

export const journeyService = { getUserJourney };
