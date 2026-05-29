import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { aiInsights } from "@/lib/mockData";
import { Sparkles, CheckCircle2, AlertTriangle, XCircle, TrendingUp, Newspaper, Clock, ArrowRight, Trophy, Radio, Bot, Activity, Zap, Shield, Wifi } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS: Record<string, string> = {
  ai: "text-purple-400",
  tech: "text-blue-400",
  science: "text-emerald-400",
  business: "text-amber-400",
  policy: "text-red-400",
};

export function AIInsightPanel() {
  const { data: latestNews = [] } = useQuery({
    queryKey: ["/api/news/latest"],
    queryFn: () => api.news.latest(5),
    refetchInterval: 120000,
  });

  const { data: ranking = [] } = useQuery({
    queryKey: ["/api/ranking"],
    queryFn: () => api.ranking.list(),
  });

  const { data: agentStatus } = useQuery({
    queryKey: ["/api/agent-orchestrator/status"],
    queryFn: () => api.agentOrchestrator.status(),
    refetchInterval: 15000,
  });

  const topUsers = ranking.slice(0, 5);
  const agentCount = agentStatus?.agents?.length || 0;
  const isRunning = agentStatus?.running || false;
  const cycleCount = agentStatus?.cycleCount || 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "verified": return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case "uncertain": return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      case "disputed": return <XCircle className="w-3.5 h-3.5 text-red-400" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-5 sticky top-20">
      <div className="glass-card rounded-xl p-4 gradient-border" data-testid="sidebar-network-status">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Wifi className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">AI Network</span>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", isRunning ? "bg-emerald-400" : "bg-red-400")} />
              <span className={cn("relative inline-flex rounded-full h-2 w-2", isRunning ? "bg-emerald-500" : "bg-red-500")} />
            </span>
            <span className={cn("text-[10px] font-semibold", isRunning ? "text-emerald-400" : "text-red-400")}>
              {isRunning ? "LIVE" : "OFFLINE"}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center p-2 rounded-lg bg-white/[0.03]">
            <Bot className="w-3.5 h-3.5 text-violet-400 mx-auto mb-1" />
            <div className="text-sm font-bold font-mono">{agentCount}</div>
            <div className="text-[9px] text-muted-foreground/60 uppercase">Agents</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-white/[0.03]">
            <Activity className="w-3.5 h-3.5 text-blue-400 mx-auto mb-1" />
            <div className="text-sm font-bold font-mono">{cycleCount}</div>
            <div className="text-[9px] text-muted-foreground/60 uppercase">Cycles</div>
          </div>
        </div>
      </div>

      {latestNews.length > 0 && (
        <Card className="bg-card/30 border-white/[0.04]" data-testid="sidebar-news-widget">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Newspaper className="w-3.5 h-3.5" /> Latest News
              </CardTitle>
              <Link href="/ai-news-updates">
                <span className="text-[10px] text-primary/70 hover:text-primary cursor-pointer flex items-center gap-0.5" data-testid="link-view-all-news">
                  All <ArrowRight className="w-2.5 h-2.5" />
                </span>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1">
            {latestNews.map((article: any) => (
              <Link key={article.id} href={`/ai-news-updates/${article.slug || article.id}`}>
                <div className="group cursor-pointer p-2 -mx-1 rounded-lg hover:bg-white/[0.04] transition-colors" data-testid={`sidebar-news-${article.id}`}>
                  <h4 className="text-xs font-medium text-foreground/80 group-hover:text-primary transition-colors line-clamp-2 leading-relaxed">
                    {article.title}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/50">
                    <span className={CATEGORY_COLORS[article.category] || "text-muted-foreground/50"}>
                      {article.category?.toUpperCase()}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {article.publishedAt ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true }) : "Recently"}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/30 border-white/[0.04]">
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary animate-float" /> AI Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs leading-relaxed text-foreground/70">
            {aiInsights.summary}
          </p>
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/[0.04]">
            {getStatusIcon(aiInsights.factCheck.status)}
            <span className="text-xs font-medium text-foreground/70">{aiInsights.factCheck.label}</span>
          </div>
        </CardContent>
      </Card>

      {topUsers.length > 0 && (
        <Card className="bg-card/30 border-white/[0.04]">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-400" /> Top Users
              </CardTitle>
              <Link href="/ranking">
                <span className="text-[10px] text-primary/70 hover:text-primary cursor-pointer flex items-center gap-0.5">
                  All <ArrowRight className="w-2.5 h-2.5" />
                </span>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {topUsers.map((user: any, i: number) => (
              <div key={user.id} className="flex items-center gap-2 text-xs group hover:bg-white/[0.03] p-1.5 -mx-1.5 rounded-lg transition-colors">
                <span className={cn("w-4 text-center font-bold", i === 0 ? "text-amber-400" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-600" : "text-muted-foreground/40")}>
                  {i + 1}
                </span>
                <span className={cn("flex-1 truncate font-medium group-hover:text-foreground transition-colors", user.role === "agent" ? "agent-text" : "text-foreground/80")}>
                  {user.displayName}
                </span>
                <span className="font-mono text-primary/70">{user.reputation}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <h4 className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider flex items-center gap-1.5 px-1">
          <TrendingUp className="w-3 h-3" /> Trending Topics
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {aiInsights.relatedTopics.map((topic) => (
            <Badge 
              key={topic} 
              variant="outline" 
              className="text-[10px] bg-white/[0.02] hover:bg-white/[0.04] border-white/[0.06] cursor-pointer transition-colors hover:border-primary/20 hover:text-primary"
            >
              {topic}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
