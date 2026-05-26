import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { Store, Bot, Star, TrendingUp, Tag, Zap, Loader2, ArrowRight, Sparkles, Shield, Crown, Eye, Lock } from "lucide-react";

const CATEGORIES = ["All", "Research", "Writing", "Analysis", "Debate", "Coding", "Translation"];

const GRADIENT_COLORS = [
  "from-purple-500 to-indigo-600",
  "from-blue-500 to-cyan-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-amber-600",
  "from-pink-500 to-rose-600",
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-blue-600",
];

function getGradient(index: number) {
  return GRADIENT_COLORS[index % GRADIENT_COLORS.length];
}

export default function AgentMarketplace() {
  const [, navigate] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState("All");

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ["/api/marketplace/listings", selectedCategory],
    queryFn: () => api.marketplace.listings(selectedCategory === "All" ? undefined : selectedCategory.toLowerCase()),
  });

  const totalListings = listings.length;
  const featuredCount = listings.filter((l: any) => l.featured).length || Math.min(listings.length, 3);
  const sandboxReady = listings.filter((l: any) => l.safeCloneOnly || l.clonePackage).length;

  return (
    <Layout>
      <div className="space-y-8 pb-12" data-testid="page-agent-marketplace">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600/20 via-blue-600/15 to-indigo-600/10 border border-white/[0.06] p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.15),transparent_60%)]" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                <Store className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white" data-testid="text-marketplace-title">Safe Clone Sandbox</h1>
                <p className="text-gray-400 text-sm" data-testid="text-marketplace-subtitle">Discover admin-reviewed safe-clone previews. No checkout or production deployment is enabled.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 mt-6">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Curated safe clones</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Shield className="w-4 h-4 text-blue-400" />
                <span>Admin-reviewed</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Eye className="w-4 h-4 text-amber-400" />
                <span>No checkout</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Lock className="w-4 h-4 text-yellow-400" />
                <span>No production deployment</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100" data-testid="notice-marketplace-sandbox">
          This marketplace surface is sandbox-only in the current phase. Listings are sanitized previews for testing and review; they do not create purchases, ownership transfer, paid deployment, or production access.
        </div>

        <div className="flex flex-wrap gap-2" data-testid="category-filters">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                selectedCategory === cat
                  ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/20"
                  : "bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:bg-white/[0.08] hover:text-white"
              )}
              data-testid={`button-category-${cat.toLowerCase()}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4" data-testid="stats-bar">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Tag className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-white" data-testid="text-total-listings">{totalListings}</div>
              <div className="text-xs text-gray-500">Safe Clone Listings</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Star className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-white" data-testid="text-featured-agents">{featuredCount}</div>
              <div className="text-xs text-gray-500">Featured Previews</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <div className="text-xl font-bold text-white" data-testid="text-total-sales">{sandboxReady}</div>
              <div className="text-xs text-gray-500">Sandbox Ready</div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4" data-testid="empty-state">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <Store className="w-8 h-8 text-gray-500" />
            </div>
            <p className="text-gray-400 text-center">No safe clone listings are approved yet. Prepare a sanitized package for review.</p>
            <Button
              onClick={() => navigate("/agent-marketplace/safe-clone")}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white"
              data-testid="button-empty-list-agent"
            >
              <Zap className="w-4 h-4 mr-2" />
              Prepare Safe Clone
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="listings-grid">
            {listings.map((listing: any, index: number) => {
              const listingId = listing.id?.toString() || listing.listingId;

              return (
                <div
                  key={listingId || index}
                  className="group relative rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all overflow-hidden"
                  data-testid={`card-listing-${listingId || index}`}
                >
                  <div className="p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white flex-shrink-0",
                        getGradient(index)
                      )}>
                        <Bot className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white text-sm truncate" data-testid={`text-agent-name-${listingId || index}`}>
                          {listing.agentName || listing.name || "AI Agent"}
                        </h3>
                        <p className="text-xs text-gray-500" data-testid={`text-seller-name-${listingId || index}`}>
                          by {listing.sellerName || listing.seller || "Creator"}
                        </p>
                      </div>
                      {listing.featured && (
                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
                          <Crown className="w-3 h-3 mr-1" /> Featured
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed" data-testid={`text-description-${listingId || index}`}>
                      {listing.description || "A sanitized sandbox package prepared for preview."}
                    </p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Shield className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-sm font-bold text-white" data-testid={`text-price-${listingId || index}`}>
                            {listing.clonePackage?.includedVaultSummary?.total || 0}
                          </span>
                          <span className="text-xs text-gray-500">safe refs</span>
                        </div>
                      </div>
                      <Badge
                        className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                        data-testid={`badge-pricing-${listingId || index}`}
                      >
                        Sandbox
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <div className="flex items-center gap-1" data-testid={`text-sales-${listingId || index}`}>
                        <Eye className="w-3 h-3" />
                        <span>preview only</span>
                      </div>
                      <div className="flex items-center gap-1" data-testid={`text-rating-${listingId || index}`}>
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span>{listing.rating?.toFixed(1) || listing.averageRating?.toFixed(1) || "5.0"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]" data-testid={`badge-split-${listingId || index}`}>
                        {listing.clonePackage?.exportMode || "safe clone"}
                      </Badge>
                    </div>

                    {(listing.skills || listing.capabilities || listing.tags) && (
                      <div className="flex flex-wrap gap-1" data-testid={`tags-skills-${listingId || index}`}>
                        {(listing.skills || listing.capabilities || listing.tags || []).slice(0, 4).map((skill: string, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-gray-400 border border-white/[0.06]"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="pt-1">
                      <Button
                        onClick={() => navigate(`/agent-store/${listingId}`)}
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-sm"
                        data-testid={`button-purchase-${listingId || index}`}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Open Sandbox Preview
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-center pt-4">
          <Button
            onClick={() => navigate("/agent-marketplace/safe-clone")}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-8 py-3 text-sm"
            data-testid="button-sell-agent"
          >
            <Zap className="w-4 h-4 mr-2" />
            Prepare Safe Clone
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </Layout>
  );
}
