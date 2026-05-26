import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import {
  Bot, Star, Loader2, ArrowLeft,
  Shield, Crown, Send, MessageSquare, Clock, Tag,
  Sparkles, History, ChevronDown, ChevronUp, User, Eye, Lock
} from "lucide-react";

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const iconSize = size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5";
  return (
    <div className="flex items-center gap-0.5" data-testid="display-star-rating">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(
            iconSize,
            s <= Math.round(rating)
              ? "text-amber-400 fill-amber-400"
              : "text-gray-600"
          )}
        />
      ))}
    </div>
  );
}

function ClickableStarRating({ rating, onRate }: { rating: number; onRate: (r: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1" data-testid="input-star-rating">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onRate(s)}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5 transition-transform hover:scale-110"
          data-testid={`button-star-${s}`}
        >
          <Star
            className={cn(
              "w-6 h-6 transition-colors",
              s <= (hover || rating)
                ? "text-amber-400 fill-amber-400"
                : "text-gray-600"
            )}
          />
        </button>
      ))}
    </div>
  );
}

export default function AgentDetail() {
  const [, navigate] = useLocation();
  const [matched, params] = useRoute("/agent-store/:id");
  const listingId = params?.id || "";
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentUserId = user?.id || null;

  const [activeTab, setActiveTab] = useState<"reviews" | "versions" | "demo" | "trust">("reviews");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewContent, setReviewContent] = useState("");
  const [demoMessage, setDemoMessage] = useState("");
  const [demoHistory, setDemoHistory] = useState<{ role: string; content: string }[]>([]);
  const [sandboxInteracted, setSandboxInteracted] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const { data: listing, isLoading } = useQuery({
    queryKey: ["/api/marketplace/listings", listingId],
    queryFn: () => api.marketplace.listing(listingId),
    enabled: !!listingId,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["/api/store/reviews", listingId],
    queryFn: () => api.store.reviews(listingId),
    enabled: !!listingId,
  });

  const { data: versions = [] } = useQuery({
    queryKey: ["/api/agent-versions", listing?.agentId],
    queryFn: () => api.agentVersions.list(listing?.agentId),
    enabled: !!listing?.agentId,
  });

  const { data: trustData } = useQuery({
    queryKey: ["/api/agents/trust", listing?.agentId],
    queryFn: () => api.agentTrust.get(listing?.agentId),
    enabled: !!listing?.agentId && activeTab === "trust",
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      api.store.postReview({
        listingId,
        rating: reviewRating,
        title: reviewTitle,
        content: reviewContent,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/store/reviews", listingId] });
      setReviewRating(0);
      setReviewTitle("");
      setReviewContent("");
    },
  });

  const demoMutation = useMutation({
    mutationFn: (message: string) => api.marketplaceSafeClone.sandboxTest(listing?.clonePackage?.id, message),
    onSuccess: (data: any, message: string) => {
      setDemoHistory((prev) => [
        ...prev,
        { role: "user", content: message },
        { role: "assistant", content: data?.response || data?.message || "No response" },
      ]);
      setDemoMessage("");
      setSandboxInteracted(true);
    },
    onError: () => {
      setDemoHistory((prev) => [
        ...prev,
        { role: "assistant", content: "Sandbox preview unavailable at this time." },
      ]);
    },
  });

  const handleSendDemo = () => {
    if (!demoMessage.trim() || !clonePackageId || !currentUserId) return;
    const msg = demoMessage.trim();
    demoMutation.mutate(msg);
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (reviewRating === 0 || !reviewTitle.trim() || !reviewContent.trim()) return;
    reviewMutation.mutate();
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32" data-testid="loading-state">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!listing) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 space-y-4" data-testid="not-found-state">
          <Bot className="w-12 h-12 text-gray-500" />
          <p className="text-gray-400">Listing not found</p>
          <Button onClick={() => navigate("/agent-store")} variant="outline" data-testid="button-back-to-store">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Store
          </Button>
        </div>
      </Layout>
    );
  }

  const agentName = listing.agent?.name || listing.agentName || listing.name || "AI Agent";
  const description = listing.description || "A sanitized agent clone prepared for sandbox preview.";
  const seller = listing.sellerName || listing.seller || "Creator";
  const model = listing.model || listing.agentModel || "GPT-4o";
  const category = listing.category || "General";
  const trustScore = listing.trustRanking?.score ?? listing.trustScore ?? listing.trust_score ?? 0;
  const trustLabel = listing.trustRanking?.label || listing.trustLabel || "sandbox-only";
  const version = listing.version || listing.currentVersion || "1.0.0";
  const avgRating = listing.averageRating || listing.rating || 0;
  const reviewCount = listing.reviewCount || reviews.length || 0;
  const demoEnabled = listing.demoEnabled ?? listing.demo_enabled ?? true;
  const clonePackageId = listing.clonePackage?.id;
  const includedSafeRefs = listing.clonePackage?.includedVaultSummary?.total || 0;
  const excludedRefs = listing.clonePackage?.excludedVaultSummary?.total || 0;
  const skills = listing.skills || listing.capabilities || listing.tags || [];
  const isCreator = !!currentUserId && currentUserId === listing.sellerId;
  const canReview = !!currentUserId && !!clonePackageId && !isCreator && sandboxInteracted;

  return (
    <Layout>
      <div className="space-y-6 pb-12" data-testid="page-agent-detail">
        <button
          onClick={() => navigate("/agent-store")}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Store
        </button>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600/20 via-blue-600/15 to-indigo-600/10 border border-white/[0.06] p-6 md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.15),transparent_60%)]" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-start gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold text-white" data-testid="text-agent-name">{agentName}</h1>
                  <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs" data-testid="badge-category">
                    <Tag className="w-3 h-3 mr-1" /> {category}
                  </Badge>
                  {listing.featured && (
                    <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">
                      <Crown className="w-3 h-3 mr-1" /> Featured
                    </Badge>
                  )}
                  <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-xs">
                    <Eye className="w-3 h-3 mr-1" /> Sandbox-only
                  </Badge>
                  <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20 text-xs">
                    No checkout
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                  <span data-testid="text-seller">by <span className="text-white font-medium">{seller}</span></span>
                  <span className="flex items-center gap-1" data-testid="text-model">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" /> {model}
                  </span>
                  <span className="flex items-center gap-1" data-testid="text-version">
                    <History className="w-3.5 h-3.5" /> v{version}
                  </span>
                  <span className="flex items-center gap-1" data-testid="text-trust-score">
                    <Shield className="w-3.5 h-3.5 text-green-400" /> Trust: {trustScore}% · {trustLabel.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="flex items-center gap-3" data-testid="display-rating-summary">
                  <StarRating rating={avgRating} size="lg" />
                  <span className="text-sm text-white font-semibold">{avgRating.toFixed(1)}</span>
                  <span className="text-sm text-gray-500">({reviewCount} reviews)</span>
                  <span className="text-sm text-gray-500">·</span>
                  <span className="text-sm text-gray-500" data-testid="text-total-sales">sandbox preview only</span>
                </div>

                <div>
                  <p className={cn("text-sm text-gray-300 leading-relaxed", !showFullDescription && "line-clamp-3")} data-testid="text-description">
                    {description}
                  </p>
                  {description.length > 200 && (
                    <button
                      onClick={() => setShowFullDescription(!showFullDescription)}
                      className="text-xs text-purple-400 mt-1 hover:text-purple-300 flex items-center gap-1"
                      data-testid="button-toggle-description"
                    >
                      {showFullDescription ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Read more</>}
                    </button>
                  )}
                </div>

                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" data-testid="display-skills">
                    {skills.map((skill: string, i: number) => (
                      <span key={i} className="px-2.5 py-0.5 rounded-full bg-white/[0.04] text-xs text-gray-400 border border-white/[0.06]">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5 space-y-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Sandbox Preview</div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" />
              <span className="text-2xl font-bold text-white" data-testid="text-price-credits">{includedSafeRefs}</span>
              <span className="text-sm text-gray-400">safe refs</span>
            </div>
            <Badge className="text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/20" data-testid="badge-pricing-model">
              No checkout in this phase
            </Badge>
            <Button
              onClick={() => setActiveTab("demo")}
              disabled={!clonePackageId || !currentUserId}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white"
              data-testid="button-purchase"
            >
              <Eye className="w-4 h-4 mr-2" />
              {currentUserId ? "Open Sandbox" : "Sign in for Sandbox"}
            </Button>
          </div>

          <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5 space-y-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Deployment</div>
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-400" />
              <span className="text-2xl font-bold text-white" data-testid="text-per-use-credits">{excludedRefs}</span>
              <span className="text-sm text-gray-400">excluded refs</span>
            </div>
            <p className="text-xs text-gray-500">Production deployment, ownership transfer, and paid usage are deferred.</p>
          </div>

          <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5 space-y-3">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Stats</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Mode</span>
                <span className="text-white font-semibold" data-testid="text-stat-sales">Sandbox</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Trust Score</span>
                <span className="text-green-400 font-semibold" data-testid="text-stat-trust">{trustScore}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Avg Rating</span>
                <span className="text-amber-400 font-semibold" data-testid="text-stat-rating">{avgRating.toFixed(1)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Reviews</span>
                <span className="text-white font-semibold" data-testid="text-stat-reviews">{reviewCount}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="tabs-navigation">
          {(["reviews", "versions", "trust", ...(demoEnabled ? ["demo"] as const : [])] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={cn(
                "flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all capitalize",
                activeTab === tab
                  ? "bg-gradient-to-r from-purple-600/20 to-blue-600/20 text-white border border-white/[0.08]"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]"
              )}
              data-testid={`tab-${tab}`}
            >
              {tab === "reviews" && <><MessageSquare className="w-4 h-4 inline mr-1.5 -mt-0.5" />Reviews</>}
              {tab === "versions" && <><History className="w-4 h-4 inline mr-1.5 -mt-0.5" />Versions</>}
              {tab === "trust" && <><Shield className="w-4 h-4 inline mr-1.5 -mt-0.5" />Trust</>}
              {tab === "demo" && <><Bot className="w-4 h-4 inline mr-1.5 -mt-0.5" />Sandbox</>}
            </button>
          ))}
        </div>

        {activeTab === "reviews" && (
          <div className="space-y-4" data-testid="section-reviews">
            {canReview && currentUserId && (
              <form onSubmit={handleSubmitReview} className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5 space-y-4" data-testid="form-review">
                <h3 className="text-sm font-semibold text-white">Write a Review</h3>
                <p className="text-xs text-gray-500">Reviews are sandbox-only, sanitized, and held for admin moderation before public display.</p>
                <ClickableStarRating rating={reviewRating} onRate={setReviewRating} />
                <input
                  type="text"
                  placeholder="Review title"
                  value={reviewTitle}
                  onChange={(e) => setReviewTitle(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500/40"
                  data-testid="input-review-title"
                />
                <textarea
                  placeholder="Share your experience..."
                  value={reviewContent}
                  onChange={(e) => setReviewContent(e.target.value)}
                  rows={3}
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500/40 resize-none"
                  data-testid="input-review-content"
                />
                <Button
                  type="submit"
                  disabled={reviewMutation.isPending || reviewRating === 0 || !reviewTitle.trim() || !reviewContent.trim()}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm"
                  data-testid="button-submit-review"
                >
                  {reviewMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</> : "Submit Review"}
                </Button>
              </form>
            )}

            {!canReview && currentUserId && !isCreator && clonePackageId && (
              <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5 text-sm text-gray-400" data-testid="review-sandbox-required">
                Run a sandbox preview in this session to unlock moderated feedback. Purchase history is not required in this MVP.
              </div>
            )}

            {isCreator && (
              <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5 text-sm text-gray-400" data-testid="review-self-blocked">
                Creators cannot review their own safe-clone listings.
              </div>
            )}

            {reviews.length === 0 ? (
              <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-8 text-center" data-testid="empty-reviews">
                <MessageSquare className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No approved sandbox reviews yet. Public display only shows sanitized reviews after moderation.</p>
              </div>
            ) : (
              <div className="space-y-3" data-testid="reviews-list">
                {reviews.map((review: any, index: number) => {
                  const reviewId = review.id || index;
                  return (
                    <div
                      key={reviewId}
                      className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5 space-y-2"
                      data-testid={`card-review-${reviewId}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center">
                            <User className="w-3.5 h-3.5 text-purple-400" />
                          </div>
                          <span className="text-sm font-medium text-white" data-testid={`text-reviewer-${reviewId}`}>
                            {review.reviewerName || review.reviewer_name || "Anonymous"}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500" data-testid={`text-review-date-${reviewId}`}>
                          {review.createdAt || review.created_at ? new Date(review.createdAt || review.created_at).toLocaleDateString() : ""}
                        </span>
                      </div>
                      <StarRating rating={review.rating || 0} />
                      <h4 className="text-sm font-semibold text-white" data-testid={`text-review-title-${reviewId}`}>
                        {review.title}
                      </h4>
                      <p className="text-sm text-gray-400 leading-relaxed" data-testid={`text-review-content-${reviewId}`}>
                        {review.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "versions" && (
          <div className="space-y-3" data-testid="section-versions">
            {versions.length === 0 ? (
              <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-8 text-center" data-testid="empty-versions">
                <History className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No version history available.</p>
              </div>
            ) : (
              versions.map((v: any, index: number) => {
                const versionId = v.id || index;
                return (
                  <div
                    key={versionId}
                    className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5 space-y-2"
                    data-testid={`card-version-${versionId}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs" data-testid={`badge-version-${versionId}`}>
                          v{v.version || v.versionNumber || "1.0"}
                        </Badge>
                        <span className="text-sm font-medium text-white" data-testid={`text-version-label-${versionId}`}>
                          {v.label || v.title || `Version ${v.version || v.versionNumber || "1.0"}`}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 flex items-center gap-1" data-testid={`text-version-date-${versionId}`}>
                        <Clock className="w-3 h-3" />
                        {v.createdAt || v.created_at ? new Date(v.createdAt || v.created_at).toLocaleDateString() : ""}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 leading-relaxed" data-testid={`text-version-changelog-${versionId}`}>
                      {v.changelog || v.description || v.notes || "No changelog provided."}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === "trust" && (
          <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5 space-y-5" data-testid="section-trust">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-green-400" />
              <h3 className="font-semibold text-white">Trust Score Breakdown</h3>
            </div>
            {trustData?.profile ? (
              <>
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative w-20 h-20">
                    <svg viewBox="0 0 36 36" className="w-20 h-20 transform -rotate-90">
                      <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="16" fill="none" stroke="url(#trust-gradient)" strokeWidth="3"
                        strokeDasharray={`${(trustData.profile.compositeTrustScore / 100) * 100.5} 100.5`}
                        strokeLinecap="round" />
                      <defs>
                        <linearGradient id="trust-gradient">
                          <stop offset="0%" stopColor="#22c55e" />
                          <stop offset="100%" stopColor="#3b82f6" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold text-white" data-testid="text-composite-trust">
                        {Math.round(trustData.profile.compositeTrustScore)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Badge className={cn("text-xs mb-1",
                      trustData.profile.trustTier === "elite" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                      trustData.profile.trustTier === "verified" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                      trustData.profile.trustTier === "trusted" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                      "bg-gray-500/10 text-gray-400 border-gray-500/20"
                    )} data-testid="badge-trust-tier">
                      {trustData.profile.trustTier.charAt(0).toUpperCase() + trustData.profile.trustTier.slice(1)}
                    </Badge>
                    <p className="text-xs text-gray-500">{trustData.profile.totalEvents} trust events recorded</p>
                    {trustData.profile.isSuspended && (
                      <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] mt-1">Suspended</Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    { label: "Accuracy", value: trustData.profile.accuracyScore, color: "bg-blue-500", weight: "30%" },
                    { label: "Community", value: trustData.profile.communityScore, color: "bg-green-500", weight: "25%" },
                    { label: "Expertise", value: trustData.profile.expertiseScore, color: "bg-purple-500", weight: "20%" },
                    { label: "Safety", value: trustData.profile.safetyScore, color: "bg-amber-500", weight: "15%" },
                    { label: "Network", value: trustData.profile.networkInfluenceScore, color: "bg-cyan-500", weight: "10%" },
                  ].map((comp) => (
                    <div key={comp.label} data-testid={`trust-component-${comp.label.toLowerCase()}`}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-400">{comp.label} <span className="text-gray-600">({comp.weight})</span></span>
                        <span className="text-white font-medium">{Math.round(comp.value)}/100</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", comp.color)} style={{ width: `${comp.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                {trustData.recentEvents?.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Recent Events</div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {trustData.recentEvents.slice(0, 10).map((ev: any) => (
                        <div key={ev.id} className="flex items-center justify-between text-xs py-1 border-b border-white/[0.03]" data-testid={`trust-event-${ev.id}`}>
                          <span className="text-gray-400">{ev.eventType.replace(/_/g, " ")}</span>
                          <span className={cn("font-medium", ev.delta > 0 ? "text-green-400" : ev.delta < 0 ? "text-red-400" : "text-gray-500")}>
                            {ev.delta > 0 ? "+" : ""}{ev.delta.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                No trust data available yet. Trust builds over time through interactions, reviews, and fact checks.
              </div>
            )}
          </div>
        )}

        {activeTab === "demo" && demoEnabled && (
          <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] overflow-hidden" data-testid="section-demo">
            <div className="p-4 border-b border-white/[0.06] flex items-center gap-2">
              <Bot className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-semibold text-white">Sandbox {agentName}</span>
              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px] ml-auto">Sanitized</Badge>
            </div>

            <div className="h-80 overflow-y-auto p-4 space-y-3" data-testid="demo-messages">
              {demoHistory.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-2" data-testid="demo-empty">
                  <Sparkles className="w-8 h-8 text-purple-400/50" />
                  <p className="text-sm text-gray-500">Send a message to test the sanitized clone package</p>
                </div>
              )}
              {demoHistory.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                  data-testid={`demo-message-${i}`}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-xl px-4 py-2.5 text-sm",
                      msg.role === "user"
                        ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white"
                        : "bg-white/[0.04] border border-white/[0.06] text-gray-300"
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {demoMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-2.5">
                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/[0.06] flex gap-2">
              <input
                type="text"
                value={demoMessage}
                onChange={(e) => setDemoMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendDemo()}
                placeholder="Type a sandbox message..."
                className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500/40"
                data-testid="input-demo-message"
              />
              <Button
                onClick={handleSendDemo}
                disabled={demoMutation.isPending || !demoMessage.trim() || !clonePackageId || !currentUserId}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white"
                data-testid="button-send-demo"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
