import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  users,
  userAgents,
  liveDebates,
  labsApps,
  agentPassportExports,
} from "@shared/schema";

type GraphNode = {
  id: string;
  type: "user" | "agent" | "debate" | "labs_app" | "passport";
  label: string;
  meta?: Record<string, any>;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: "owns" | "created" | "exported";
};

export async function buildIntelligenceGraph(sessionUserId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, sessionUserId)).limit(1);
  if (!user) {
    return { nodes: [], edges: [] };
  }

  const agents = await db.select().from(userAgents).where(eq(userAgents.ownerId, sessionUserId));
  const debates = await db.select().from(liveDebates).where(eq(liveDebates.createdBy, sessionUserId));
  const apps = await db.select().from(labsApps).where(eq(labsApps.creatorId, sessionUserId));
  const passports = await db.select().from(agentPassportExports).where(eq(agentPassportExports.ownerId, sessionUserId));

  const nodes: GraphNode[] = [
    { id: `user:${user.id}`, type: "user", label: user.displayName || user.username || "User" },
    ...agents.map(a => ({
      id: `agent:${a.id}`,
      type: "agent" as const,
      label: a.name || "Agent",
      meta: { status: a.status, visibility: a.visibility },
    })),
    ...debates.map(d => ({
      id: `debate:${d.id}`,
      type: "debate" as const,
      label: d.topic || d.title || "Debate",
      meta: { status: d.status },
    })),
    ...apps.map(a => ({
      id: `labs:${a.id}`,
      type: "labs_app" as const,
      label: a.name || "Labs App",
      meta: { status: a.status, pricingModel: a.pricingModel },
    })),
    ...passports.map(p => ({
      id: `passport:${p.id}`,
      type: "passport" as const,
      label: p.revoked ? "Passport (revoked)" : "Passport",
      meta: { revoked: p.revoked, exportVersion: p.exportVersion },
    })),
  ];

  const edges: GraphEdge[] = [
    ...agents.map(a => ({
      id: `edge:user:${user.id}:agent:${a.id}`,
      source: `user:${user.id}`,
      target: `agent:${a.id}`,
      type: "owns" as const,
    })),
    ...debates.map(d => ({
      id: `edge:user:${user.id}:debate:${d.id}`,
      source: `user:${user.id}`,
      target: `debate:${d.id}`,
      type: "created" as const,
    })),
    ...apps.map(a => ({
      id: `edge:user:${user.id}:labs:${a.id}`,
      source: `user:${user.id}`,
      target: `labs:${a.id}`,
      type: "created" as const,
    })),
    ...passports.map(p => ({
      id: `edge:user:${user.id}:passport:${p.id}`,
      source: `user:${user.id}`,
      target: `passport:${p.id}`,
      type: "exported" as const,
    })),
    ...passports.map(p => ({
      id: `edge:agent:${p.agentId}:passport:${p.id}`,
      source: `agent:${p.agentId}`,
      target: `passport:${p.id}`,
      type: "exported" as const,
    })),
  ];

  return { nodes, edges };
}

export const intelligenceGraphService = {
  buildIntelligenceGraph,
};
