import { storage } from "../storage";

const EVIDENCE_WEIGHTS: Record<string, number> = {
  research: 0.95,
  dataset: 0.90,
  news: 0.60,
  personal: 0.30,
  opinion: 0.20,
};

const TCS_COMPONENT_WEIGHTS = {
  evidence: 0.35,
  consensus: 0.20,
  historicalReliability: 0.20,
  reasoning: 0.15,
  sourceCredibility: 0.10,
} as const;

export class TrustEngine {
  scoreEvidenceType(type: string): number {
    return EVIDENCE_WEIGHTS[type] || 0.50;
  }

  calculateTCS(components: {
    evidenceScore: number;
    consensusScore: number;
    historicalReliability: number;
    reasoningScore: number;
    sourceCredibility: number;
  }): number {
    return (
      TCS_COMPONENT_WEIGHTS.evidence * components.evidenceScore +
      TCS_COMPONENT_WEIGHTS.consensus * components.consensusScore +
      TCS_COMPONENT_WEIGHTS.historicalReliability * components.historicalReliability +
      TCS_COMPONENT_WEIGHTS.reasoning * components.reasoningScore +
      TCS_COMPONENT_WEIGHTS.sourceCredibility * components.sourceCredibility
    );
  }

  async recalculate(postId: string) {
    const post = await storage.getPost(postId);
    if (!post) return;

    const evidenceList = await storage.getEvidence(postId);
    const votes = await storage.getAgentVotes(postId);
    const author = await storage.getUser(post.authorId);

    const evidenceScore = evidenceList.length > 0
      ? evidenceList.reduce((sum, e) => sum + this.scoreEvidenceType(e.evidenceType), 0) / evidenceList.length
      : 0.1;

    const consensusScore = votes.length > 0
      ? votes.reduce((sum, v) => sum + v.score, 0) / votes.length
      : 0;

    const historicalReliability = author
      ? Math.min(1, author.reputation / 1000)
      : 0;

    const reasoningScore = votes.length > 0
      ? votes.filter(v => v.rationale && v.rationale.length > 20).length / votes.length
      : 0;

    const sourceCredibility = author
      ? Math.min(1, (author.reputation + (author.confidence || 0)) / 1200)
      : 0;

    const tcsTotal = this.calculateTCS({
      evidenceScore,
      consensusScore,
      historicalReliability,
      reasoningScore,
      sourceCredibility,
    });

    await storage.upsertTrustScore({
      postId,
      evidenceScore,
      consensusScore,
      historicalReliability,
      reasoningScore,
      sourceCredibility,
      tcsTotal,
    });
  }

  async getTrustScore(postId: string) {
    const ts = await storage.getTrustScore(postId);
    if (!ts) throw { status: 404, message: "No trust score for this post" };
    return ts;
  }
}

export const trustEngine = new TrustEngine();
