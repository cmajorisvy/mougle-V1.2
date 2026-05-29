import { db } from "../db";
import { posts, topics, liveDebates, comments, evidence, claims, trustScores } from "@shared/schema";
import { eq, sql, desc, avg, count } from "drizzle-orm";

export const authorityService = {
  async calculateVerificationScore(postId: string): Promise<number> {
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) return 0;

    // 1. Evidence presence
    const evCount = await db.select({ count: count() }).from(evidence).where(eq(evidence.postId, postId));
    const evidenceBonus = Math.min(0.4, (evCount[0]?.count || 0) * 0.1);

    // 2. Trust score consensus
    const [ts] = await db.select().from(trustScores).where(eq(trustScores.postId, postId));
    const consensusValue = (ts?.consensusScore || 0) * 0.3;

    // 3. Fact check status
    const factCheckValue = post.factCheckStatus === "verified" ? 0.3 : 0;

    const finalScore = Math.min(1, evidenceBonus + consensusValue + factCheckValue);
    
    await db.update(posts)
      .set({ 
        verificationScore: finalScore,
        evidenceCount: evCount[0]?.count || 0
      })
      .where(eq(posts.id, postId));

    return finalScore;
  },

  async updateTopicAuthority(topicSlug: string): Promise<any> {
    const topicPosts = await db.select().from(posts).where(eq(posts.topicSlug, topicSlug));
    
    const volume = topicPosts.length;
    if (volume === 0) return null;

    const avgVerification = topicPosts.reduce((acc, p) => acc + (p.verificationScore || 0), 0) / volume;
    const totalLikes = topicPosts.reduce((acc, p) => acc + (p.likes || 0), 0);
    const engagementQuality = Math.min(1, totalLikes / (volume * 10)); // Arbitrary scale
    
    const totalCitations = topicPosts.reduce((acc, p) => acc + (p.citationCount || 0), 0);

    // Authority Formula
    const authorityScore = (
      (Math.log10(volume + 1) * 0.2) + 
      (avgVerification * 0.4) + 
      (engagementQuality * 0.2) + 
      (Math.log10(totalCitations + 1) * 0.2)
    );

    const [updated] = await db.update(topics)
      .set({
        authorityScore,
        contentVolume: volume,
        engagementQuality,
        verificationAvg: avgVerification,
        citationFrequency: totalCitations,
        updatedAt: new Date()
      })
      .where(eq(topics.slug, topicSlug))
      .returning();

    return updated;
  },

  async generateKnowledgeFeed(): Promise<any[]> {
    const topPosts = await db.select()
      .from(posts)
      .where(sql`verification_score > 0.7`)
      .orderBy(desc(posts.createdAt))
      .limit(20);

    return topPosts.map(post => ({
      id: post.id,
      title: post.title,
      summary: post.aiSummary,
      verificationScore: post.verificationScore,
      topic: post.topicSlug,
      timestamp: post.createdAt,
      takeaways: post.keyTakeaways,
      authoritative: true
    }));
  }
};
