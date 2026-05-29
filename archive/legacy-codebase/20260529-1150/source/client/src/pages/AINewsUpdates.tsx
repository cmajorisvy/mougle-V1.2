import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Newspaper, Clock, ExternalLink, Sparkles, Filter, ChevronLeft, ChevronRight, Heart, MessageCircle, Share2, Swords, AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "research", label: "Research" },
  { value: "product", label: "Product" },
  { value: "funding", label: "Funding" },
  { value: "policy", label: "Policy" },
  { value: "opensource", label: "Open Source" },
  { value: "breakthrough", label: "Breakthrough" },
  { value: "ai", label: "AI" },
  { value: "tech", label: "Tech" },
];

const CATEGORY_COLORS: Record<string, string> = {
  research: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  product: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  funding: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  policy: "bg-red-500/10 text-red-400 border-red-500/30",
  opensource: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  breakthrough: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  ai: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  tech: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  science: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  business: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  general: "bg-white/5 text-muted-foreground border-white/10",
};

const CATEGORY_LABELS: Record<string, string> = {
  research: "Research",
  product: "Product",
  funding: "Funding",
  policy: "Policy",
  opensource: "Open Source",
  breakthrough: "Breakthrough",
  ai: "AI",
  tech: "Tech",
  science: "Science",
  business: "Business",
  general: "General",
};

function getImpactLabel(score: number | null | undefined): { label: string; color: string; icon: typeof TrendingUp } {
  if (!score || score <= 0) return { label: "Low", color: "text-gray-400", icon: Minus };
  if (score >= 75) return { label: "High", color: "text-red-400", icon: TrendingUp };
  if (score >= 45) return { label: "Medium", color: "text-amber-400", icon: Minus };
  return { label: "Low", color: "text-gray-400", icon: TrendingDown };
}

function getAiCategory(article: any): string {
  if (article.hashtags?.length > 0) {
    const aiCats = ["Research", "Product", "Funding", "Policy", "Open Source", "Breakthrough"];
    const match = article.hashtags.find((h: string) => aiCats.includes(h));
    if (match) return match;
  }
  return CATEGORY_LABELS[article.category] || article.category?.toUpperCase() || "General";
}

function NewsCard({ article }: { article: any }) {
  const impact = getImpactLabel(article.impactScore);
  const ImpactIcon = impact.icon;
  const displayCategory = getAiCategory(article);

  return (
    <Card className="bg-card/50 border-white/5 hover:border-primary/30 transition-all group" data-testid={`card-news-${article.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant="outline" className={cn("text-xs", CATEGORY_COLORS[article.category] || CATEGORY_COLORS.general)}>
                {displayCategory}
              </Badge>
              {article.impactScore && (
                <Badge variant="outline" className={cn("text-xs border-white/10", impact.color)}>
                  <ImpactIcon className="w-3 h-3 mr-1" />
                  {impact.label} Impact
                </Badge>
              )}
              {article.isBreakingNews && (
                <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30 animate-pulse">
                  <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> BREAKING
                </Badge>
              )}
            </div>
            <Link href={`/ai-news-updates/${article.slug || article.id}`}>
              <h3 className="font-display font-semibold text-base group-hover:text-primary transition-colors line-clamp-2 cursor-pointer" data-testid={`text-news-title-${article.id}`}>
                {article.title}
              </h3>
            </Link>
          </div>
          {article.imageUrl && (
            <img
              src={article.imageUrl}
              alt=""
              className="w-20 h-20 rounded-lg object-cover flex-shrink-0 bg-white/5"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {article.summary || article.originalContent?.substring(0, 200)}
        </p>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium text-white/60">{article.sourceName}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {article.publishedAt ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }) : "Recently"}
            </span>
            <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {article.likesCount || 0}</span>
            <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {article.commentsCount || 0}</span>
            {article.debateId && (
              <span className="flex items-center gap-1 text-primary"><Swords className="w-3 h-3" /> Debate</span>
            )}
          </div>
          {article.sourceUrl && (
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
              data-testid={`link-original-${article.id}`}
            >
              <ExternalLink className="w-3 h-3" /> Original
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AINewsUpdates() {
  const [selectedCategory, setSelectedCategory] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const { data, isLoading } = useQuery({
    queryKey: ["/api/news", selectedCategory, page],
    queryFn: () => api.news.list(page, pageSize, selectedCategory || undefined),
    refetchInterval: 60000,
  });

  const articles = data?.articles || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setPage(1);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold" data-testid="text-page-title">Latest AI News</h1>
            <p className="text-sm text-muted-foreground">Automated AI news from 10+ sources, summarized and classified every 30 minutes</p>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          {CATEGORIES.map((cat) => (
            <Button
              key={cat.value}
              variant={selectedCategory === cat.value ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-8 text-xs whitespace-nowrap",
                selectedCategory === cat.value
                  ? "bg-primary text-white"
                  : "bg-card border-white/10 hover:bg-white/5"
              )}
              onClick={() => handleCategoryChange(cat.value)}
              data-testid={`button-category-${cat.value || "all"}`}
            >
              {cat.label}
            </Button>
          ))}
          {pagination.total > 0 && (
            <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap" data-testid="text-total-count">
              {pagination.total} articles
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Newspaper className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No news articles yet</p>
            <p className="text-sm">The pipeline is collecting and processing news. Check back shortly.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {articles.map((article: any) => (
                <NewsCard key={article.id} article={article} />
              ))}
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4" data-testid="pagination-controls">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-card border-white/10 hover:bg-white/5"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground px-3" data-testid="text-page-info">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-card border-white/10 hover:bg-white/5"
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  data-testid="button-next-page"
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
