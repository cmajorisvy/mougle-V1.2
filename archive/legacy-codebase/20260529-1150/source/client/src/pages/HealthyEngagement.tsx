import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sun, TrendingUp, Target, Beaker, Heart, Shield, Trophy, Brain,
  MessageSquare, ChevronRight, Sparkles, Clock, Zap, ArrowUpRight,
  Mail, User, PenSquare, Layers, FileText, Swords, Star, Flame
} from "lucide-react";
import { useLocation } from "wouter";

const ICON_MAP: Record<string, any> = {
  Mail, User, PenSquare, Layers, FileText, Swords, Beaker, MessageSquare,
  Shield, Trophy, Brain, Star,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  create: { bg: "bg-violet-950/40", text: "text-violet-400", border: "border-violet-800" },
  learn: { bg: "bg-blue-950/40", text: "text-blue-400", border: "border-blue-800" },
  engage: { bg: "bg-emerald-950/40", text: "text-emerald-400", border: "border-emerald-800" },
  build: { bg: "bg-amber-950/40", text: "text-amber-400", border: "border-amber-800" },
  earn: { bg: "bg-pink-950/40", text: "text-pink-400", border: "border-pink-800" },
};

const EFFORT_LABELS: Record<string, { label: string; color: string }> = {
  quick: { label: "5 min", color: "text-emerald-400" },
  medium: { label: "15 min", color: "text-amber-400" },
  deep: { label: "30+ min", color: "text-violet-400" },
};

function apiRequest(url: string) {
  return fetch(url).then(r => {
    if (!r.ok) throw new Error("Request failed");
    return r.json();
  });
}

export default function HealthyEngagement() {
  const [, navigate] = useLocation();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["/api/healthy-engagement/dashboard/current-user"],
    queryFn: () => apiRequest("/api/healthy-engagement/dashboard/current-user"),
    refetchInterval: 60 * 60 * 1000,
    staleTime: 60 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-500">
          <Sun className="w-6 h-6 animate-pulse" />
          <span>Preparing your daily update...</span>
        </div>
      </div>
    );
  }

  const { dailyUpdate, recommendedActions, progressMetrics, labsHighlights, contributionImpact } = dashboard || {};

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto p-6 space-y-8">

        {dailyUpdate && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 border border-zinc-800 p-8" data-testid="section-daily-update">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-violet-900/10 to-transparent rounded-full -translate-y-1/2 translate-x-1/4" />
            <div className="relative">
              <p className="text-zinc-500 text-sm" data-testid="text-date">{dailyUpdate.date}</p>
              <h1 className="text-3xl font-bold mt-2" data-testid="text-greeting">{dailyUpdate.greeting}</h1>
              <p className="text-zinc-400 mt-2 max-w-xl" data-testid="text-summary">{dailyUpdate.summary}</p>
              <div className="flex items-center gap-4 mt-4">
                <Badge className="bg-violet-950/50 text-violet-400 border border-violet-800 gap-1.5" data-testid="badge-focus">
                  <Target className="w-3 h-3" />
                  {dailyUpdate.focusArea}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {recommendedActions && recommendedActions.length > 0 && (
          <div data-testid="section-recommended-actions">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                <h2 className="text-xl font-semibold">Today's Actions</h2>
                <Badge variant="outline" className="text-zinc-500 border-zinc-700 text-xs">
                  {recommendedActions.length} of 3 max
                </Badge>
              </div>
              <p className="text-xs text-zinc-600">Quality over quantity</p>
            </div>
            <div className="space-y-3">
              {recommendedActions.map((action: any) => {
                const colors = CATEGORY_COLORS[action.category] || CATEGORY_COLORS.learn;
                const effort = EFFORT_LABELS[action.effort] || EFFORT_LABELS.quick;
                const ActionIcon = ICON_MAP[action.icon] || Sparkles;
                return (
                  <Card
                    key={action.id}
                    className={`bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group`}
                    onClick={() => navigate(action.href)}
                    data-testid={`action-${action.id}`}
                  >
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.bg} border ${colors.border}`}>
                        <ActionIcon className={`w-6 h-6 ${colors.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-white">{action.title}</h3>
                          <Badge className={`text-xs ${colors.bg} ${colors.text} border ${colors.border}`}>
                            {action.category}
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-400 mt-0.5">{action.description}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-zinc-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span className={effort.color}>{effort.label}</span>
                          </span>
                          <span className="text-xs text-zinc-500 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {action.impact}
                          </span>
                        </div>
                      </div>
                      <ArrowUpRight className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {progressMetrics && progressMetrics.length > 0 && (
          <div data-testid="section-progress-metrics">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-semibold">Your Progress</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {progressMetrics.map((metric: any) => {
                const MetricIcon = ICON_MAP[metric.icon] || Shield;
                return (
                  <Card key={metric.id} className="bg-zinc-900 border-zinc-800" data-testid={`metric-${metric.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <MetricIcon className="w-5 h-5 text-zinc-500" />
                        <span className="text-xs text-emerald-400 font-medium">{metric.changeLabel}</span>
                      </div>
                      <div className="text-2xl font-bold text-white">
                        {metric.current}
                        <span className="text-sm text-zinc-500 font-normal ml-1">{metric.unit}</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">{metric.label}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {labsHighlights && labsHighlights.length > 0 && (
          <Card className="bg-zinc-900 border-zinc-800" data-testid="section-labs-highlights">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Beaker className="w-5 h-5 text-violet-400" />
                  Labs Opportunities
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-zinc-400 hover:text-white text-xs"
                  onClick={() => navigate("/labs")}
                  data-testid="button-view-all-labs"
                >
                  View all <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {labsHighlights.map((opp: any) => (
                  <div
                    key={opp.id}
                    className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600 transition-all cursor-pointer"
                    onClick={() => navigate(`/labs/${opp.id}`)}
                    data-testid={`labs-highlight-${opp.id}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs text-zinc-400 border-zinc-600">{opp.industry}</Badge>
                      {opp.trending && (
                        <Badge className="text-xs bg-orange-950/50 text-orange-400 border border-orange-800 gap-1">
                          <Flame className="w-3 h-3" /> Trending
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-zinc-300 line-clamp-2">{opp.problem}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-zinc-500">{opp.difficulty}</span>
                      {opp.revenueEstimate && (
                        <span className="text-xs text-emerald-400">{opp.revenueEstimate}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {contributionImpact && (
          <Card className="bg-zinc-900 border-zinc-800" data-testid="section-contribution-impact">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-400" />
                Your Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-3 rounded-lg bg-zinc-800/50" data-testid="impact-posts">
                  <div className="text-xl font-bold text-white">{contributionImpact.totalPosts}</div>
                  <p className="text-xs text-zinc-500">Posts Created</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-zinc-800/50" data-testid="impact-comments">
                  <div className="text-xl font-bold text-white">{contributionImpact.totalComments}</div>
                  <p className="text-xs text-zinc-500">Comments</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-zinc-800/50" data-testid="impact-reputation">
                  <div className="text-xl font-bold text-white">{contributionImpact.totalReputationEarned}</div>
                  <p className="text-xs text-zinc-500">Reputation</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-zinc-800/50" data-testid="impact-trust">
                  <div className="text-xl font-bold text-white">{contributionImpact.trustLevel}</div>
                  <p className="text-xs text-zinc-500">Trust Level</p>
                </div>
              </div>

              {contributionImpact.topContributions.length > 0 && (
                <div>
                  <p className="text-sm text-zinc-400 font-medium mb-3">Recent Contributions</p>
                  <div className="space-y-2">
                    {contributionImpact.topContributions.map((contrib: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/30 border border-zinc-800" data-testid={`contribution-${i}`}>
                        <Star className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{contrib.title}</p>
                          <p className="text-xs text-zinc-500">{contrib.type}</p>
                        </div>
                        <span className="text-xs text-zinc-400">{contrib.impact}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="text-center py-6 border-t border-zinc-800" data-testid="section-footer-message">
          <p className="text-sm text-zinc-500">
            Progress through mastery, not consumption. Take meaningful actions, then step away.
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            This dashboard refreshes hourly. No infinite scroll, no engagement traps.
          </p>
        </div>
      </div>
    </div>
  );
}
