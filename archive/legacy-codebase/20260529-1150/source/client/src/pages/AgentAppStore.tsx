import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import {
  Store, Bot, Star, Search, TrendingUp, Loader2,
  ArrowRight, ArrowLeft, Sparkles, Shield, Crown, CheckCircle,
  Flame, ChevronRight, Eye, Zap, Briefcase
} from "lucide-react";

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

function getTrustBadge(trustScore: number) {
  if (trustScore >= 80) return { label: "Verified", color: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle };
  if (trustScore >= 60) return { label: "Trusted", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: Shield };
  return { label: "New", color: "bg-gray-500/10 text-gray-400 border-gray-500/20", icon: Bot };
}

function getRankingBadge(label?: string) {
  switch (label) {
    case "high-trust":
      return { label: "High Trust", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle };
    case "trusted":
      return { label: "Trusted", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: Shield };
    case "needs-review":
      return { label: "Needs Review", color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: Shield };
    case "sandbox-only":
      return { label: "Sandbox Only", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", icon: Eye };
    default:
      return { label: "New", color: "bg-gray-500/10 text-gray-400 border-gray-500/20", icon: Bot };
  }
}

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;
  const iconSize = size === "md" ? "w-4 h-4" : "w-3 h-3";

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(<Star key={i} className={cn(iconSize, "text-amber-400 fill-amber-400")} />);
    } else if (i === fullStars && hasHalf) {
      stars.push(<Star key={i} className={cn(iconSize, "text-amber-400 fill-amber-400/50")} />);
    } else {
      stars.push(<Star key={i} className={cn(iconSize, "text-gray-600")} />);
    }
  }
  return <div className="flex items-center gap-0.5">{stars}</div>;
}

function AgentCard({ listing, index, onClick }: { listing: any; index: number; onClick: () => void }) {
  const listingId = listing.id?.toString() || String(index);
  const trustScore = listing.trustRanking?.score ?? listing.agent?.trustScore ?? listing.qualityScore ?? 0;
  const trust = listing.trustRanking?.label ? getRankingBadge(listing.trustRanking.label) : getTrustBadge(trustScore);
  const TrustIcon = trust.icon;
  const reviewSummary = listing.sandboxReviewSummary || listing.trustRanking?.reviewSummary || {};

  return (
    <div
      onClick={onClick}
      className="group relative rounded-xl bg-[#141422]/80 border border-white/[0.06] hover:border-white/[0.12] transition-all cursor-pointer overflow-hidden hover:shadow-lg hover:shadow-purple-500/5"
      data-testid={`card-agent-${listingId}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-white flex-shrink-0 shadow-lg",
            getGradient(index)
          )}>
            <Bot className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm truncate" data-testid={`text-agent-name-${listingId}`}>
              {listing.title || listing.agent?.name || "Intelligent Entity"}
            </h3>
            <p className="text-xs text-gray-500" data-testid={`text-seller-${listingId}`}>
              by {listing.sellerName || "Creator"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {listing.featured && (
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]" data-testid={`badge-featured-${listingId}`}>
                <Crown className="w-3 h-3 mr-0.5" /> Featured
              </Badge>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed" data-testid={`text-description-${listingId}`}>
          {listing.description || "A sanitized agent clone prepared for sandbox preview."}
        </p>

        <div className="flex items-center gap-2">
          <StarRating rating={listing.averageRating || 0} />
          <span className="text-xs text-gray-500" data-testid={`text-rating-${listingId}`}>
            {(listing.averageRating || 0).toFixed(1)}
          </span>
          <span className="text-xs text-gray-600">
            ({listing.reviewCount || 0})
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-sm font-bold text-white" data-testid={`text-price-${listingId}`}>
              {listing.clonePackage?.includedVaultSummary?.total || 0}
            </span>
            <span className="text-xs text-gray-500">safe refs</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500" data-testid={`text-sales-${listingId}`}>
            <Eye className="w-3 h-3" />
            <span>preview only</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge className={cn("text-[10px]", trust.color)} data-testid={`badge-trust-${listingId}`}>
            <TrustIcon className="w-3 h-3 mr-0.5" /> {trust.label} {trustScore > 0 && `${trustScore}%`}
          </Badge>
          <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-[10px]" data-testid={`badge-sandbox-only-${listingId}`}>
            <Eye className="w-3 h-3 mr-0.5" /> sandbox-only
          </Badge>
          {(reviewSummary.approvedCount || 0) > 0 && (
            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]" data-testid={`badge-review-summary-${listingId}`}>
              <Star className="w-3 h-3 mr-0.5 fill-amber-400" /> {reviewSummary.approvedCount} approved review{reviewSummary.approvedCount === 1 ? "" : "s"}
            </Badge>
          )}
          {listing.category && (
            <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]" data-testid={`badge-category-${listingId}`}>
              {listing.category}
            </Badge>
          )}
          {(listing.totalSales || 0) >= 10 && (
            <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]" data-testid={`badge-trending-${listingId}`}>
              <Flame className="w-3 h-3 mr-0.5" /> Trending
            </Badge>
          )}
          {(listing.averageRating || 0) >= 4.5 && (listing.reviewCount || 0) >= 3 && (
            <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-[10px]" data-testid={`badge-top-rated-${listingId}`}>
              <Star className="w-3 h-3 mr-0.5 fill-yellow-400" /> Top Rated
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AgentAppStore() {
  const [, navigate] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedIndustry, setSelectedIndustry] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [carouselIndex, setCarouselIndex] = useState(0);

  const { data: industryList = [] } = useQuery({
    queryKey: ["/api/industries"],
    queryFn: () => api.industries.list(),
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: featured = [], isLoading: featuredLoading } = useQuery({
    queryKey: ["/api/store/featured"],
    queryFn: () => api.store.featured(),
  });

  const { data: trending = [], isLoading: trendingLoading } = useQuery({
    queryKey: ["/api/store/trending"],
    queryFn: () => api.store.trending(10),
  });

  const { data: rankings = [], isLoading: rankingsLoading } = useQuery({
    queryKey: ["/api/store/rankings"],
    queryFn: () => api.store.rankings(20),
    enabled: !debouncedSearch,
  });

  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ["/api/store/search", debouncedSearch, selectedCategory],
    queryFn: () => api.store.search(debouncedSearch, selectedCategory === "All" ? undefined : selectedCategory.toLowerCase()),
    enabled: !!debouncedSearch,
  });

  const isSearching = !!debouncedSearch;
  const displayListings = isSearching ? searchResults : rankings;
  const isLoading = isSearching ? searchLoading : rankingsLoading;

  const filteredListings = displayListings.filter((l: any) => {
    if (selectedCategory !== "All" && !isSearching && l.category?.toLowerCase() !== selectedCategory.toLowerCase()) return false;
    if (selectedIndustry !== "All" && l.agent?.industrySlug !== selectedIndustry) return false;
    return true;
  });

  const handleNavigate = useCallback((id: string) => {
    navigate(`/agent-store/${id}`);
  }, [navigate]);

  const featuredVisible = featured.slice(carouselIndex, carouselIndex + 3);
  const canNext = carouselIndex + 3 < featured.length;
  const canPrev = carouselIndex > 0;

  return (
    <Layout>
      <div className="space-y-8 pb-12" data-testid="page-agent-app-store">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600/20 via-blue-600/15 to-indigo-600/10 border border-white/[0.06] p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.15),transparent_60%)]" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-500/10 to-transparent rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Store className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white" data-testid="text-store-title">Safe Clone Store Preview</h1>
                <p className="text-gray-400 text-sm" data-testid="text-store-subtitle">Discover admin-reviewed safe-clone previews. Checkout and production deployment are disabled.</p>
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
                <Zap className="w-4 h-4 text-green-400" />
                <span>No production deployment</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100" data-testid="notice-store-sandbox">
          Store listings are sandbox-only previews in this phase. They do not create purchases, paid usage, ownership transfer, creator earnings, or live deployment.
        </div>

        <div className="relative">
          <div className="flex items-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 z-10" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search agents by name, category, or capability..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#141422]/80 border border-white/[0.06] text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all"
              data-testid="input-search-agents"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                data-testid="button-clear-search"
              >
                ✕
              </button>
            )}
          </div>
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

        {industryList.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap" data-testid="industry-filters">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Briefcase className="w-3.5 h-3.5" />
              <span>Industry:</span>
            </div>
            <button
              onClick={() => setSelectedIndustry("All")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-all",
                selectedIndustry === "All"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-white/[0.03] text-gray-500 border border-white/[0.04] hover:bg-white/[0.06] hover:text-gray-300"
              )}
              data-testid="button-industry-all"
            >
              All Industries
            </button>
            {industryList.map((ind: any) => (
              <button
                key={ind.slug}
                onClick={() => setSelectedIndustry(ind.slug)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1",
                  selectedIndustry === ind.slug
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-white/[0.03] text-gray-500 border border-white/[0.04] hover:bg-white/[0.06] hover:text-gray-300"
                )}
                data-testid={`button-industry-${ind.slug}`}
              >
                <span>{ind.icon}</span>
                {ind.name}
                {ind.regulated && <Shield className="w-3 h-3 text-amber-400 ml-0.5" />}
              </button>
            ))}
          </div>
        )}

        {featured.length > 0 && !isSearching && (
          <section data-testid="section-featured">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold text-white" data-testid="text-featured-heading">Featured Agents</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-white disabled:opacity-30"
                  onClick={() => setCarouselIndex(Math.max(0, carouselIndex - 3))}
                  disabled={!canPrev}
                  data-testid="button-carousel-prev"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-white disabled:opacity-30"
                  onClick={() => setCarouselIndex(carouselIndex + 3)}
                  disabled={!canNext}
                  data-testid="button-carousel-next"
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {featuredLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="featured-grid">
                {featuredVisible.map((listing: any, i: number) => {
                  const lid = listing.id?.toString() || String(carouselIndex + i);
                  const trustScore = listing.trustRanking?.score ?? listing.agent?.trustScore ?? listing.qualityScore ?? 0;
                  return (
                    <div
                      key={lid}
                      onClick={() => handleNavigate(lid)}
                      className="relative rounded-xl overflow-hidden cursor-pointer group"
                      data-testid={`card-featured-${lid}`}
                    >
                      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-20 group-hover:opacity-30 transition-opacity", getGradient(carouselIndex + i))} />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.1),transparent_70%)]" />
                      <div className="relative p-5 bg-[#141422]/60 border border-white/[0.06] rounded-xl backdrop-blur-sm space-y-3">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg", getGradient(carouselIndex + i))}>
                            <Bot className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-white truncate" data-testid={`text-featured-name-${lid}`}>
                              {listing.title || listing.agent?.name || "Featured Agent"}
                            </h3>
                            <p className="text-xs text-gray-400">{listing.sellerName || "Creator"}</p>
                          </div>
                          <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
                            <Crown className="w-3 h-3 mr-0.5" /> Featured
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-2">{listing.description || "Admin-reviewed sandbox agent preview"}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <StarRating rating={listing.averageRating || 0} size="md" />
                            <span className="text-sm text-gray-400">({listing.reviewCount || 0})</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Shield className="w-4 h-4 text-emerald-400" />
                            <span className="font-bold text-white">{listing.clonePackage?.includedVaultSummary?.total || 0}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>preview only</span>
                          {trustScore > 0 && (
                            <Badge className={cn("text-[10px]", trustScore >= 80 ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20")}>
                              <Shield className="w-3 h-3 mr-0.5" /> {trustScore}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {trending.length > 0 && !isSearching && (
          <section data-testid="section-trending">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-bold text-white" data-testid="text-trending-heading">Trending Agents</h2>
              <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-xs">Top 10</Badge>
            </div>
            {trendingLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="trending-grid">
                {trending.slice(0, 10).map((listing: any, i: number) => {
                  const lid = listing.id?.toString() || String(i);
                  const trustScore = listing.trustRanking?.score ?? listing.agent?.trustScore ?? listing.qualityScore ?? 0;
                  const sandboxCount = listing.trustRanking?.sandboxTestCount || 0;
                  return (
                    <div
                      key={lid}
                      onClick={() => handleNavigate(lid)}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[#141422]/80 border border-white/[0.06] hover:border-white/[0.12] cursor-pointer transition-all group"
                      data-testid={`card-trending-${lid}`}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500/20 to-amber-500/10 text-orange-400 font-bold text-sm flex-shrink-0">
                        #{i + 1}
                      </div>
                      <div className={cn("w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center text-white flex-shrink-0", getGradient(i))}>
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-white truncate" data-testid={`text-trending-name-${lid}`}>
                          {listing.title || listing.agent?.name || "Entity"}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{sandboxCount} sandbox test{sandboxCount === 1 ? "" : "s"}</span>
                          <span>·</span>
                          <div className="flex items-center gap-0.5">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span>{(listing.averageRating || 0).toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1">
                          <Shield className="w-3 h-3 text-emerald-400" />
                          <span className="text-sm font-bold text-white">{listing.clonePackage?.includedVaultSummary?.total || 0}</span>
                        </div>
                        {trustScore >= 80 && (
                          <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[9px] mt-0.5">
                            <CheckCircle className="w-2.5 h-2.5 mr-0.5" /> Verified
                          </Badge>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section data-testid="section-rankings">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {isSearching ? (
                <>
                  <Search className="w-5 h-5 text-purple-400" />
                  <h2 className="text-lg font-bold text-white" data-testid="text-rankings-heading">
                    Search Results
                  </h2>
                  <span className="text-sm text-gray-500">({filteredListings.length})</span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-bold text-white" data-testid="text-rankings-heading">
                    Top Ranked Safe-Clone Previews
                  </h2>
                </>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4" data-testid="empty-state">
              <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                <Store className="w-8 h-8 text-gray-500" />
              </div>
              <p className="text-gray-400 text-center">
                {isSearching ? "No agents match your search." : "No agents listed yet."}
              </p>
              {isSearching && (
                <Button
                  onClick={() => { setSearchQuery(""); setDebouncedSearch(""); }}
                  variant="ghost"
                  className="text-purple-400 hover:text-purple-300"
                  data-testid="button-clear-search-results"
                >
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="rankings-grid">
              {filteredListings.map((listing: any, index: number) => (
                <AgentCard
                  key={listing.id?.toString() || index}
                  listing={listing}
                  index={index}
                  onClick={() => handleNavigate(listing.id?.toString() || String(index))}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
