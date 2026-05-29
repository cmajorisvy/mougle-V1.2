import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Beaker, TrendingUp, Rocket, Download, Globe, Eye, Link2,
  UserPlus, Trophy, Crown, ArrowRight, RefreshCw, Zap,
  BarChart3, Users, DollarSign, Activity, Target, Sparkles
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { LabsCreatorRanking } from "@shared/schema";

const stageIcons: Record<string, any> = {
  beaker: Beaker,
  rocket: Rocket,
  globe: Globe,
  download: Download,
  eye: Eye,
  link: Link2,
  "user-plus": UserPlus,
};

const tierColors: Record<string, string> = {
  starter: "text-gray-400",
  builder: "text-blue-400",
  creator: "text-emerald-400",
  pro: "text-amber-400",
  elite: "text-violet-400",
};

const tierBadgeColors: Record<string, string> = {
  starter: "bg-gray-500/20 text-gray-400 border-gray-500/20",
  builder: "bg-blue-500/20 text-blue-400 border-blue-500/20",
  creator: "bg-emerald-500/20 text-emerald-400 border-emerald-500/20",
  pro: "bg-amber-500/20 text-amber-400 border-amber-500/20",
  elite: "bg-violet-500/20 text-violet-400 border-violet-500/20",
};

function GrowthLoopVisual({ stages }: { stages: any[] }) {
  return (
    <div className="relative" data-testid="section-growth-loop">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {stages.map((stage: any, i: number) => {
          const Icon = stageIcons[stage.icon] || Activity;
          return (
            <div key={stage.name} className="relative">
              <Card className="glass-card rounded-xl p-4 text-center hover:bg-white/[0.06] transition-all" data-testid={`card-stage-${i}`}>
                <Icon className="w-6 h-6 mx-auto mb-2 text-primary" />
                <div className="text-lg font-bold">{stage.value.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">{stage.name}</div>
              </Card>
              {i < stages.length - 1 && (
                <div className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10">
                  <ArrowRight className="w-4 h-4 text-primary/40" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConversionFunnel({ funnel }: { funnel: any }) {
  const stages = [
    { label: "Opportunities → Builds", value: funnel.opportunitiesToBuilds },
    { label: "Builds → Published", value: funnel.buildsToPublished },
    { label: "Published → Installs", value: funnel.publishedToInstalls },
    { label: "Views → Conversions", value: funnel.viewsToConversions },
  ];

  return (
    <Card className="glass-card rounded-xl p-5" data-testid="section-conversion-funnel">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Conversion Funnel</h3>
      </div>
      <div className="space-y-3">
        {stages.map((s) => (
          <div key={s.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-semibold">{s.value}%</span>
            </div>
            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-violet-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(s.value, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CreatorLeaderboard({ rankings }: { rankings: LabsCreatorRanking[] }) {
  return (
    <Card className="glass-card rounded-xl p-5" data-testid="section-creator-leaderboard">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold">Creator Leaderboard</h3>
      </div>
      {rankings.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No creators yet. Be the first to publish an app!</p>
      ) : (
        <div className="space-y-2">
          {rankings.map((creator, i) => (
            <div
              key={creator.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg",
                i === 0 ? "bg-amber-500/10 border border-amber-500/20" :
                i === 1 ? "bg-gray-500/10 border border-gray-500/20" :
                i === 2 ? "bg-orange-500/10 border border-orange-500/20" :
                "bg-white/[0.03]"
              )}
              data-testid={`row-creator-${creator.id}`}
            >
              <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center font-bold text-sm">
                {i < 3 ? (
                  <Crown className={cn("w-4 h-4", i === 0 ? "text-amber-400" : i === 1 ? "text-gray-400" : "text-orange-400")} />
                ) : (
                  <span className="text-muted-foreground">{creator.rank || i + 1}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">Creator #{creator.creatorId.slice(0, 8)}</span>
                  <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", tierBadgeColors[creator.tier])}>
                    {creator.tier}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                  <span>{creator.totalApps} apps</span>
                  <span>{creator.totalInstalls} installs</span>
                  <span>{creator.totalReferrals} referrals</span>
                </div>
              </div>
              {creator.avgRating !== null && creator.avgRating > 0 && (
                <div className="flex items-center gap-1 text-xs">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>{(creator.avgRating || 0).toFixed(1)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function LabsFlywheel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summary, isLoading } = useQuery({
    queryKey: ["labs-flywheel-summary"],
    queryFn: () => api.labs.flywheel.summary(),
  });

  const { data: growthLoop } = useQuery({
    queryKey: ["labs-flywheel-growth-loop"],
    queryFn: () => api.labs.flywheel.growthLoop(),
  });

  const generateMutation = useMutation({
    mutationFn: () => api.labs.flywheel.generate(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["labs-flywheel"] });
      toast({ title: `Generated ${data.generated} new opportunities` });
    },
  });

  const snapshotMutation = useMutation({
    mutationFn: () => api.labs.flywheel.snapshot(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["labs-flywheel"] });
      toast({ title: "Analytics snapshot captured" });
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
          <Skeleton className="w-48 h-8" />
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="w-full h-64" />
        </div>
      </Layout>
    );
  }

  const current = summary?.current || {};
  const topCreators = summary?.topCreators || [];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold flex items-center gap-2" data-testid="text-flywheel-title">
              <RefreshCw className="w-5 h-5 text-primary" /> Labs Flywheel
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Continuous growth loop: Intelligence → Opportunities → Apps → Users → Intelligence
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => snapshotMutation.mutate()}
              disabled={snapshotMutation.isPending}
              data-testid="button-snapshot"
            >
              <BarChart3 className="w-4 h-4 mr-1" /> Snapshot
            </Button>
            <Button
              size="sm"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-generate"
            >
              <Zap className="w-4 h-4 mr-1" /> Generate Opportunities
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="section-overview-stats">
          <Card className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Beaker className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] text-muted-foreground">Opportunities</span>
            </div>
            <div className="text-2xl font-bold" data-testid="stat-opportunities">{current.totalOpportunities || 0}</div>
          </Card>
          <Card className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Rocket className="w-4 h-4 text-orange-400" />
              <span className="text-[10px] text-muted-foreground">Builds</span>
            </div>
            <div className="text-2xl font-bold" data-testid="stat-builds">{current.totalBuilds || 0}</div>
          </Card>
          <Card className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] text-muted-foreground">Published</span>
            </div>
            <div className="text-2xl font-bold" data-testid="stat-published">{current.totalPublished || 0}</div>
          </Card>
          <Card className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Download className="w-4 h-4 text-violet-400" />
              <span className="text-[10px] text-muted-foreground">Installs</span>
            </div>
            <div className="text-2xl font-bold" data-testid="stat-installs">{current.totalInstalls || 0}</div>
          </Card>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] text-muted-foreground">Active Creators</span>
            </div>
            <div className="text-2xl font-bold" data-testid="stat-creators">{current.activeCreators || 0}</div>
          </Card>
          <Card className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <UserPlus className="w-4 h-4 text-pink-400" />
              <span className="text-[10px] text-muted-foreground">Referral Signups</span>
            </div>
            <div className="text-2xl font-bold" data-testid="stat-referrals">{current.referralSignups || 0}</div>
          </Card>
          <Card className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              <span className="text-[10px] text-muted-foreground">Conversion Rate</span>
            </div>
            <div className="text-2xl font-bold" data-testid="stat-conversion">{current.conversionRate || 0}%</div>
          </Card>
          <Card className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] text-muted-foreground">Success Rate</span>
            </div>
            <div className="text-2xl font-bold" data-testid="stat-success">{summary?.successRate || 0}%</div>
          </Card>
        </div>

        {growthLoop && (
          <>
            <div>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-primary" /> Growth Loop
              </h2>
              <GrowthLoopVisual stages={growthLoop.stages} />
            </div>

            <ConversionFunnel funnel={growthLoop.conversionFunnel} />
          </>
        )}

        <CreatorLeaderboard rankings={topCreators} />

        <Card className="glass-card rounded-xl p-6 border-primary/20 bg-gradient-to-r from-primary/5 to-violet-500/5" data-testid="section-flywheel-explanation">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> How the Flywheel Works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="space-y-2">
              <div className="text-primary font-semibold">1. Discover</div>
              <p className="text-muted-foreground text-xs">20-30 new AI-generated app opportunities appear daily, each with complete specs and review-readiness models.</p>
            </div>
            <div className="space-y-2">
              <div className="text-primary font-semibold">2. Build</div>
              <p className="text-muted-foreground text-xs">One-click project creation generates scaffolds with industry-specific legal compliance built in.</p>
            </div>
            <div className="space-y-2">
              <div className="text-primary font-semibold">3. Publish & Share</div>
              <p className="text-muted-foreground text-xs">Auto-generated landing pages with referral links bring new users back to the platform.</p>
            </div>
            <div className="space-y-2">
              <div className="text-primary font-semibold">4. Grow</div>
              <p className="text-muted-foreground text-xs">New users discover more opportunities, creating a self-sustaining creator economy.</p>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
