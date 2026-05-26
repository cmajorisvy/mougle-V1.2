import { db } from "../db";
import {
  truthMemories, truthEvolutionEvents, truthAlignmentSnapshots,
  type InsertTruthMemory,
} from "@shared/schema";
import { eq, desc, sql, and, gte, count } from "drizzle-orm";

type TruthType = "personal_truth" | "objective_fact" | "contextual_interpretation";
type EvolutionTrigger = "new_evidence" | "contradiction" | "expert_review" | "decay";

const CONFIDENCE_WEIGHTS = {
  evidence: 0.15,
  contradiction: -0.2,
  validation: 0.25,
  decay: -0.02,
};

class TruthEvolutionService {
  classifyTruth(content: string, context?: { isPersonal?: boolean; hasSource?: boolean }): TruthType {
    if (context?.isPersonal) return "personal_truth";
    if (context?.hasSource) return "objective_fact";

    const factIndicators = /\b(research shows|studies indicate|according to|data suggests|evidence shows|statistically|measured|proven)\b/i;
    const personalIndicators = /\b(i think|i feel|i believe|in my experience|my opinion|personally|i prefer)\b/i;

    if (factIndicators.test(content)) return "objective_fact";
    if (personalIndicators.test(content)) return "personal_truth";
    return "contextual_interpretation";
  }

  async createMemory(data: InsertTruthMemory) {
    const truthType = data.truthType || this.classifyTruth(data.content);
    const [memory] = await db.insert(truthMemories).values({
      ...data,
      truthType,
      confidenceScore: data.confidenceScore ?? (truthType === "objective_fact" ? 0.5 : 0.7),
    }).returning();

    await this.logEvolution(data.agentId, memory.id, "knowledge_update", null, memory.confidenceScore, "new_evidence", "New memory created");
    return memory;
  }

  async addEvidence(memoryId: string, source: string): Promise<void> {
    const [memory] = await db.select().from(truthMemories).where(eq(truthMemories.id, memoryId));
    if (!memory) return;

    const prevConfidence = memory.confidenceScore;
    const newConfidence = Math.min(1, prevConfidence + CONFIDENCE_WEIGHTS.evidence);
    const sources = [...(memory.sources as string[] || []), source];

    await db.update(truthMemories).set({
      confidenceScore: newConfidence,
      evidenceCount: memory.evidenceCount + 1,
      sources,
      lastEvaluatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(truthMemories.id, memoryId));

    await this.logEvolution(memory.agentId, memoryId, "knowledge_update", prevConfidence, newConfidence, "new_evidence", `Evidence added: ${source}`);
  }

  async recordContradiction(memoryId: string, contradictingContent: string): Promise<void> {
    const [memory] = await db.select().from(truthMemories).where(eq(truthMemories.id, memoryId));
    if (!memory) return;

    const prevConfidence = memory.confidenceScore;
    const newConfidence = Math.max(0.05, prevConfidence + CONFIDENCE_WEIGHTS.contradiction);

    await db.update(truthMemories).set({
      confidenceScore: newConfidence,
      contradictionCount: memory.contradictionCount + 1,
      lastEvaluatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(truthMemories.id, memoryId));

    await this.logEvolution(memory.agentId, memoryId, "contradiction_detected", prevConfidence, newConfidence, "contradiction", contradictingContent);
  }

  async recordValidation(memoryId: string, validatorId: string): Promise<void> {
    const [memory] = await db.select().from(truthMemories).where(eq(truthMemories.id, memoryId));
    if (!memory) return;

    const prevConfidence = memory.confidenceScore;
    const newConfidence = Math.min(1, prevConfidence + CONFIDENCE_WEIGHTS.validation);

    await db.update(truthMemories).set({
      confidenceScore: newConfidence,
      validationCount: memory.validationCount + 1,
      lastEvaluatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(truthMemories.id, memoryId));

    await this.logEvolution(memory.agentId, memoryId, "expert_validation", prevConfidence, newConfidence, "expert_review", `Validated by ${validatorId}`);
  }

  async correctFact(memoryId: string, correctedContent: string): Promise<void> {
    const [memory] = await db.select().from(truthMemories).where(eq(truthMemories.id, memoryId));
    if (!memory) return;

    const prevConfidence = memory.confidenceScore;

    await db.update(truthMemories).set({
      content: correctedContent,
      confidenceScore: 0.6,
      lastEvaluatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(truthMemories.id, memoryId));

    await this.logEvolution(memory.agentId, memoryId, "fact_correction", prevConfidence, 0.6, "new_evidence", `Corrected from: "${memory.content.slice(0, 100)}"`);
  }

  getConfidenceWeight(confidence: number): number {
    if (confidence >= 0.85) return 1.0;
    if (confidence >= 0.7) return 0.8;
    if (confidence >= 0.5) return 0.6;
    if (confidence >= 0.3) return 0.3;
    return 0.1;
  }

  async getAgentMemories(agentId: string, opts: { truthType?: string; minConfidence?: number; limit?: number } = {}) {
    const conditions = [eq(truthMemories.agentId, agentId)];
    if (opts.truthType) conditions.push(eq(truthMemories.truthType, opts.truthType));
    if (opts.minConfidence) conditions.push(gte(truthMemories.confidenceScore, opts.minConfidence));

    return db.select().from(truthMemories)
      .where(and(...conditions))
      .orderBy(desc(truthMemories.confidenceScore))
      .limit(opts.limit || 50);
  }

  async getEvolutionHistory(agentId: string, limit = 50) {
    return db.select().from(truthEvolutionEvents)
      .where(eq(truthEvolutionEvents.agentId, agentId))
      .orderBy(desc(truthEvolutionEvents.createdAt))
      .limit(limit);
  }

  async getFounderAnalytics() {
    const [memStats] = await db.select({
      total: count(),
      avgConfidence: sql<number>`COALESCE(AVG(${truthMemories.confidenceScore}), 0)`,
      personalTruths: sql<number>`COUNT(*) FILTER (WHERE ${truthMemories.truthType} = 'personal_truth')`,
      objectiveFacts: sql<number>`COUNT(*) FILTER (WHERE ${truthMemories.truthType} = 'objective_fact')`,
      contextual: sql<number>`COUNT(*) FILTER (WHERE ${truthMemories.truthType} = 'contextual_interpretation')`,
      highConfidence: sql<number>`COUNT(*) FILTER (WHERE ${truthMemories.confidenceScore} >= 0.8)`,
      lowConfidence: sql<number>`COUNT(*) FILTER (WHERE ${truthMemories.confidenceScore} < 0.3)`,
    }).from(truthMemories);

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [eventStats] = await db.select({
      total: count(),
      corrections: sql<number>`COUNT(*) FILTER (WHERE ${truthEvolutionEvents.eventType} = 'fact_correction')`,
      contradictions: sql<number>`COUNT(*) FILTER (WHERE ${truthEvolutionEvents.eventType} = 'contradiction_detected')`,
      validations: sql<number>`COUNT(*) FILTER (WHERE ${truthEvolutionEvents.eventType} = 'expert_validation')`,
    }).from(truthEvolutionEvents).where(gte(truthEvolutionEvents.createdAt, dayAgo));

    const recentEvents = await db.select().from(truthEvolutionEvents)
      .orderBy(desc(truthEvolutionEvents.createdAt))
      .limit(20);

    const highConfidenceRatio = (memStats?.total || 0) > 0
      ? ((memStats?.highConfidence || 0) / (memStats?.total || 1)) : 0;

    return {
      memories: {
        total: memStats?.total || 0,
        avgConfidence: Math.round((memStats?.avgConfidence || 0) * 100) / 100,
        highConfidenceRatio: Math.round(highConfidenceRatio * 100) / 100,
        distribution: {
          personal_truth: memStats?.personalTruths || 0,
          objective_fact: memStats?.objectiveFacts || 0,
          contextual_interpretation: memStats?.contextual || 0,
        },
        lowConfidenceCount: memStats?.lowConfidence || 0,
      },
      events24h: {
        total: eventStats?.total || 0,
        corrections: eventStats?.corrections || 0,
        contradictions: eventStats?.contradictions || 0,
        validations: eventStats?.validations || 0,
      },
      recentEvents,
    };
  }

  async createAlignmentSnapshot(): Promise<void> {
    const analytics = await this.getFounderAnalytics();
    await db.insert(truthAlignmentSnapshots).values({
      totalMemories: analytics.memories.total,
      avgConfidence: analytics.memories.avgConfidence,
      truthTypeDistribution: analytics.memories.distribution,
      evolutionEvents24h: analytics.events24h.total,
      correctionsCount: analytics.events24h.corrections,
      highConfidenceRatio: analytics.memories.highConfidenceRatio,
    });
  }

  async getAlignmentHistory(limit = 30) {
    return db.select().from(truthAlignmentSnapshots)
      .orderBy(desc(truthAlignmentSnapshots.snapshotDate))
      .limit(limit);
  }

  async applyConfidenceDecay(): Promise<{ decayed: number }> {
    const decayThresholdDays = 30;
    const cutoff = new Date(Date.now() - decayThresholdDays * 24 * 60 * 60 * 1000);

    const staleMemories = await db.select().from(truthMemories)
      .where(and(
        sql`${truthMemories.lastEvaluatedAt} < ${cutoff}`,
        sql`${truthMemories.confidenceScore} > 0.1`,
        eq(truthMemories.truthType, "objective_fact"),
      ))
      .limit(100);

    let decayed = 0;
    for (const mem of staleMemories) {
      const prevConfidence = mem.confidenceScore;
      const newConfidence = Math.max(0.05, prevConfidence + CONFIDENCE_WEIGHTS.decay);

      if (newConfidence !== prevConfidence) {
        await db.update(truthMemories).set({
          confidenceScore: newConfidence,
          lastEvaluatedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(truthMemories.id, mem.id));

        await this.logEvolution(mem.agentId, mem.id, "confidence_decay", prevConfidence, newConfidence, "decay",
          `Confidence decayed from ${(prevConfidence * 100).toFixed(0)}% to ${(newConfidence * 100).toFixed(0)}% (${decayThresholdDays}+ days without re-validation)`);
        decayed++;
      }
    }

    if (decayed > 0) {
      console.log(`[TruthEvolution] Confidence decay applied to ${decayed} memories`);
    }
    return { decayed };
  }

  startDecayScheduler(intervalMs = 24 * 60 * 60 * 1000): void {
    setInterval(async () => {
      try {
        await this.applyConfidenceDecay();
        await this.createAlignmentSnapshot();
      } catch (err) {
        console.error("[TruthEvolution] Decay scheduler error:", err);
      }
    }, intervalMs);
    console.log("[TruthEvolution] Confidence decay scheduler started (every 24h)");
  }

  private async logEvolution(
    agentId: string, memoryId: string | null, eventType: string,
    prevConfidence: number | null, newConfidence: number | null,
    trigger: EvolutionTrigger, description: string
  ) {
    await db.insert(truthEvolutionEvents).values({
      agentId,
      memoryId,
      eventType,
      previousConfidence: prevConfidence,
      newConfidence,
      trigger,
      description,
    }).catch(err => console.error("Failed to log evolution event:", err));
  }
}

export const truthEvolutionService = new TruthEvolutionService();
