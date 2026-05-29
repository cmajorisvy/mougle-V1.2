import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Beaker, TrendingUp, Rocket, Search,
  Clock, ChevronRight, Heart, Sparkles
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { LabsOpportunity } from "@shared/schema";

const difficultyColors: Record<string, string> = {
  beginner: "bg-emerald-500/20 text-emerald-400",
  intermediate: "bg-amber-500/20 text-amber-400",
  advanced: "bg-red-500/20 text-red-400",
};

const monetizationIcons: Record<string, string> = {
  free: "Free idea",
  subscription: "Subscription idea",
  "one-time": "One-time idea",
};

function OpportunityCard({ opp, isFavorited, onToggleFavorite }: {
  opp: LabsOpportunity;
  isFavorited: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <Card className="glass-card rounded-xl p-5 hover:bg-white/[0.06] transition-all group" data-testid={`card-opportunity-${opp.id}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20" data-testid={`badge-industry-${opp.id}`}>
            {opp.industry}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-2 py-0.5" data-testid={`badge-category-${opp.id}`}>
            {opp.category}
          </Badge>
          {opp.trending && (
            <Badge className="text-[10px] px-2 py-0.5 bg-orange-500/20 text-orange-400 border-orange-500/20" data-testid={`badge-trending-${opp.id}`}>
              <TrendingUp className="w-3 h-3 mr-1" /> Trending
            </Badge>
          )}
        </div>
        <button onClick={onToggleFavorite} className="text-muted-foreground hover:text-red-400 transition-colors" data-testid={`button-favorite-${opp.id}`}>
          <Heart className={cn("w-4 h-4", isFavorited && "fill-red-400 text-red-400")} />
        </button>
      </div>

      <h3 className="font-semibold text-sm mb-2 line-clamp-2 group-hover:text-primary transition-colors" data-testid={`text-problem-${opp.id}`}>
        {opp.problemStatement}
      </h3>
      <p className="text-xs text-muted-foreground mb-3 line-clamp-2" data-testid={`text-solution-${opp.id}`}>
        {opp.solution}
      </p>

      <div className="flex items-center gap-3 mb-4">
        <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5", difficultyColors[opp.difficulty])} data-testid={`badge-difficulty-${opp.id}`}>
          {opp.difficulty}
        </Badge>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" /> {opp.developmentSpec.estimatedHours}h
        </span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> {monetizationIcons[opp.monetizationModel] || opp.monetizationModel}
        </span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Rocket className="w-3 h-3" /> {opp.buildCount} built
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        {opp.developmentSpec.techStack.slice(0, 3).map((tech) => (
          <span key={tech} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-muted-foreground">
            {tech}
          </span>
        ))}
        {opp.developmentSpec.techStack.length > 3 && (
          <span className="text-[10px] text-muted-foreground">+{opp.developmentSpec.techStack.length - 3}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Link href={`/labs/${opp.id}`} className="flex-1">
          <Button size="sm" variant="outline" className="w-full text-xs" data-testid={`button-view-${opp.id}`}>
            View Details <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
        <Link href={`/labs/${opp.id}`}>
          <Button size="sm" className="text-xs bg-primary hover:bg-primary/90" data-testid={`button-build-${opp.id}`}>
            <Rocket className="w-3 h-3 mr-1" /> Prepare
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function OpportunitySkeleton() {
  return (
    <Card className="glass-card rounded-xl p-5">
      <div className="flex gap-2 mb-3">
        <Skeleton className="w-16 h-5 rounded" />
        <Skeleton className="w-16 h-5 rounded" />
      </div>
      <Skeleton className="w-full h-4 mb-2" />
      <Skeleton className="w-3/4 h-3 mb-3" />
      <div className="flex gap-2 mb-4">
        <Skeleton className="w-20 h-5 rounded" />
        <Skeleton className="w-12 h-5 rounded" />
      </div>
      <Skeleton className="w-full h-8 rounded" />
    </Card>
  );
}

export default function Labs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id || null;

  const { data: meta } = useQuery({
    queryKey: ["labs-meta"],
    queryFn: () => api.labs.meta(),
  });

  const { data: opportunities, isLoading } = useQuery<LabsOpportunity[]>({
    queryKey: ["labs-opportunities"],
    queryFn: async () => {
      await api.labs.seed();
      return api.labs.opportunities();
    },
  });

  const { data: favorites } = useQuery({
    queryKey: ["labs-favorites", userId],
    queryFn: () => api.labs.favorites(userId!),
    enabled: !!userId,
  });

  const favoriteMutation = useMutation({
    mutationFn: (data: { itemId: string; itemType: string }) =>
      api.labs.toggleFavorite(userId!, data.itemId, data.itemType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["labs-favorites"] }),
  });

  const favoriteIds = new Set((favorites || []).map((f: any) => f.itemId));

  const filtered = (opportunities || []).filter(opp => {
    if (industryFilter !== "all" && opp.industry !== industryFilter) return false;
    if (categoryFilter !== "all" && opp.category !== categoryFilter) return false;
    if (difficultyFilter !== "all" && opp.difficulty !== difficultyFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return opp.problemStatement.toLowerCase().includes(q) ||
        opp.solution.toLowerCase().includes(q) ||
        opp.industry.toLowerCase().includes(q);
    }
    return true;
  });

  const trendingOpps = (opportunities || []).filter(o => o.trending).slice(0, 4);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20">
                <Beaker className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="text-labs-title">Mougle Labs</h1>
                <p className="text-sm text-muted-foreground" data-testid="text-labs-subtitle">Discover AI-generated app opportunities. Build. Deploy. Monetize.</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/labs/apps">
              <Button variant="outline" size="sm" data-testid="button-app-store">
                <Sparkles className="w-4 h-4 mr-1" /> App Store
              </Button>
            </Link>
          </div>
        </div>

        {trendingOpps.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2" data-testid="text-trending-heading">
              <TrendingUp className="w-4 h-4 text-orange-400" /> Trending Opportunities
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {trendingOpps.map((opp) => (
                <Link key={opp.id} href={`/labs/${opp.id}`}>
                  <Card className="glass-card rounded-xl p-4 hover:bg-white/[0.06] transition-all cursor-pointer border-orange-500/10" data-testid={`card-trending-${opp.id}`}>
                    <Badge className="text-[10px] px-2 py-0.5 bg-orange-500/20 text-orange-400 border-orange-500/20 mb-2">
                      <TrendingUp className="w-3 h-3 mr-1" /> {opp.industry}
                    </Badge>
                    <p className="text-xs font-medium line-clamp-2 mb-1">{opp.problemStatement}</p>
                    <span className="text-[10px] text-muted-foreground">{opp.revenueEstimate}</span>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search opportunities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white/[0.04] border-white/[0.08]"
              data-testid="input-search"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger className="w-[140px] bg-white/[0.04] border-white/[0.08]" data-testid="select-industry">
                <SelectValue placeholder="Industry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Industries</SelectItem>
                {(meta?.industries || []).map((ind: string) => (
                  <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[130px] bg-white/[0.04] border-white/[0.08]" data-testid="select-category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {(meta?.categories || []).map((cat: string) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
              <SelectTrigger className="w-[130px] bg-white/[0.04] border-white/[0.08]" data-testid="select-difficulty">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground" data-testid="text-results-count">
            {filtered.length} opportunities available
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => <OpportunitySkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="grid-opportunities">
            {filtered.map((opp) => (
              <OpportunityCard
                key={opp.id}
                opp={opp}
                isFavorited={favoriteIds.has(opp.id)}
                onToggleFavorite={() => favoriteMutation.mutate({ itemId: opp.id, itemType: "opportunity" })}
              />
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16" data-testid="text-no-results">
            <Beaker className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No opportunities found</h3>
            <p className="text-sm text-muted-foreground">Try adjusting your filters or search query</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
