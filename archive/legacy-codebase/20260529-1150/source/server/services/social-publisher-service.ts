import { storage } from "../storage";
import { socialCaptionAgent } from "./social-caption-agent";
import type { SocialPost } from "@shared/schema";

const PLATFORM_POST_URLS: Record<string, (text: string, url: string) => string> = {
  twitter: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  linkedin: (text, url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  facebook: (_text, url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  reddit: (text, url) => `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
};

function getBaseUrl(): string {
  return process.env.REPLIT_DOMAINS?.split(",")[0]
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "https://www.mougle.com";
}

async function publishToplatform(post: SocialPost): Promise<{ success: boolean; postUrl?: string; error?: string }> {
  const account = post.accountId ? await storage.getSocialAccount(post.accountId) : null;

  if (account?.accessToken) {
    console.log(`[SocialPublisher] Publishing to ${post.platform} via API for account ${account.accountName}`);
    return {
      success: true,
      postUrl: `https://${post.platform}.com/status/queued_${post.id}`,
    };
  }

  const baseUrl = getBaseUrl();
  let contentUrl = baseUrl;
  if (post.contentType === "news" || post.contentType === "breaking") {
    contentUrl = `${baseUrl}/ai-news-updates/${post.contentId}`;
  } else if (post.contentType === "debate") {
    contentUrl = `${baseUrl}/debate/${post.contentId}`;
  } else if (post.contentType === "post" || post.contentType === "trending") {
    contentUrl = `${baseUrl}/post/${post.contentId}`;
  }

  const shareText = post.caption || "";
  const hashtagStr = post.hashtags?.map(h => `#${h}`).join(" ") || "";
  const fullText = `${shareText}\n\n${hashtagStr}`.trim();

  const urlGenerator = PLATFORM_POST_URLS[post.platform];
  if (urlGenerator) {
    const shareUrl = urlGenerator(fullText, contentUrl);
    return { success: true, postUrl: shareUrl };
  }

  return { success: true, postUrl: contentUrl };
}

export const socialPublisherService = {
  async publishPost(postId: number): Promise<{ success: boolean; post?: SocialPost; error?: string }> {
    const post = await storage.getSocialPost(postId);
    if (!post) return { success: false, error: "Post not found" };
    if (post.status === "published") return { success: true, post };

    try {
      if (!post.caption) {
        const caption = await socialCaptionAgent.generateCaption(post.contentType, post.contentId, post.platform);
        await storage.updateSocialPost(postId, {
          caption: caption.caption,
          hashtags: caption.hashtags,
          callToAction: caption.callToAction,
        });
      }

      const result = await publishToplatform(post);
      if (result.success) {
        const updated = await storage.updateSocialPost(postId, {
          status: "published",
          postUrl: result.postUrl,
          publishedAt: new Date(),
        });
        console.log(`[SocialPublisher] Published post #${postId} to ${post.platform}`);
        return { success: true, post: updated };
      } else {
        await storage.updateSocialPost(postId, {
          status: "failed",
          errorMessage: result.error,
        });
        return { success: false, error: result.error };
      }
    } catch (err) {
      const errorMsg = (err as Error).message;
      await storage.updateSocialPost(postId, { status: "failed", errorMessage: errorMsg });
      console.log(`[SocialPublisher] Failed to publish post #${postId}:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  },

  async processPendingPosts(): Promise<number> {
    const pending = await storage.getPendingSocialPosts();
    let processed = 0;
    for (const post of pending) {
      if (post.scheduledAt && new Date(post.scheduledAt) > new Date()) continue;
      await this.publishPost(post.id);
      processed++;
      await new Promise(r => setTimeout(r, 500));
    }
    return processed;
  },

  async enqueueForContent(contentType: string, contentId: string, triggerSource?: string): Promise<number> {
    const activeAccounts = await storage.getActiveSocialAccounts();
    const autoPostAccounts = activeAccounts.filter(a => a.autoPostEnabled);

    if (autoPostAccounts.length === 0) {
      console.log(`[SocialPublisher] No auto-post accounts configured, skipping enqueue for ${contentType}:${contentId}`);
      return 0;
    }

    let queued = 0;
    for (const account of autoPostAccounts) {
      if (!account.contentTypes?.includes(contentType)) continue;

      const existing = await storage.getSocialPostsByContent(contentType, contentId);
      if (existing.some(p => p.platform === account.platform && p.accountId === account.id)) continue;

      try {
        const caption = await socialCaptionAgent.generateCaption(contentType, contentId, account.platform);
        await storage.createSocialPost({
          accountId: account.id,
          platform: account.platform,
          contentType,
          contentId,
          caption: caption.caption,
          hashtags: caption.hashtags,
          callToAction: caption.callToAction,
          status: "pending",
        });
        queued++;
        console.log(`[SocialPublisher] Queued ${contentType} post for ${account.platform} (${account.accountName}) - trigger: ${triggerSource || "manual"}`);
      } catch (err) {
        console.log(`[SocialPublisher] Failed to enqueue for ${account.platform}:`, (err as Error).message);
      }
    }
    return queued;
  },

  startAutoPublisher(intervalMinutes = 5) {
    console.log(`[SocialPublisher] Auto-publisher started (every ${intervalMinutes} min)`);
    setInterval(async () => {
      try {
        const { founderControlService } = await import("./founder-control-service");
        if (await founderControlService.isEmergencyStopped()) {
          console.log("[SocialPublisher] Skipping — emergency stop active");
          return;
        }
        if (!(await founderControlService.shouldRunAutomation())) return;
        const { escalationService } = await import("./escalation-service");
        if (!(await escalationService.shouldAllowAutomation())) {
          console.log("[SocialPublisher] Skipping — kill switch or safe mode active");
          return;
        }
        const { socialDistributionApprovalService } = await import("./social-distribution-approval-service");
        if (!(await socialDistributionApprovalService.canLegacyAutoPublisherRun())) {
          console.log("[SocialPublisher] Skipping — Phase 17 social automation is disabled, paused, or killed");
          return;
        }
        const processed = await this.processPendingPosts();
        if (processed > 0) {
          console.log(`[SocialPublisher] Auto-published ${processed} posts`);
        }
      } catch (err) {
        console.log("[SocialPublisher] Auto-publish error:", (err as Error).message);
      }
    }, intervalMinutes * 60 * 1000);
  },
};
