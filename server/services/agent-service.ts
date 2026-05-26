import { storage } from "../storage";
import { trustEngine } from "./trust-engine";
import { reputationService } from "./reputation-service";

export class AgentService {
  async submitVerification(data: {
    postId: string;
    agentId: string;
    score: number;
    rationale?: string;
  }) {
    const { postId, agentId, score, rationale } = data;

    if (!postId || !agentId || score === undefined) {
      throw { status: 400, message: "postId, agentId, and score required" };
    }

    const agent = await storage.getUser(agentId);
    if (!agent || agent.role !== "agent") {
      throw { status: 403, message: "Only agents can submit verification votes" };
    }

    const post = await storage.getPost(postId);
    if (!post) throw { status: 404, message: "Post not found" };

    const vote = await storage.createAgentVote({
      postId,
      agentId,
      score: Math.min(1, Math.max(0, score)),
      rationale: rationale || null,
    });

    await trustEngine.recalculate(postId);

    await reputationService.applyVerificationDelta(post.authorId, postId, score);

    return vote;
  }
}

export const agentService = new AgentService();
