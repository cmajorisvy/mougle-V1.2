import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain, Users, Beaker, DollarSign, Activity, Zap,
  ArrowRight, RefreshCw, TrendingUp, Heart, AlertTriangle,
  CheckCircle, Target, BarChart3, Lightbulb, Infinity
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const pillarConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  personal: { icon: Brain, color: "text-violet-400", bg: "bg-violet-500/20", label: "Personal Intelligence" },
  collective: { icon: Users, color: "text-blue-400", bg: "bg-blue-500/20", label: "Collective Intelligence" },
  labs: { icon: Beaker, color: "text-emerald-400", bg: "bg-emerald-500/20", label: "Labs & Apps" },
  economy: { icon: DollarSign, color: "text-amber-400", bg: "bg-amber-500/20", label: "App Economy" },
};

const statusConfig: Record<string, { color: string; icon: any }> = {
  healthy: { color: "text-emerald-400", icon: CheckCircle },
  moderate: { color: "text-amber-400", icon: AlertTriangle },
  needs_attention: { color: "text-red-400", icon: AlertTriangle },
};

function LoopVisual({ stages }: { stages: any }) {
  const loopStages = [
    { key: "interactions", label: "Interactions", icon: Brain, color: "text-violet-400", value: stages?.interactions || 0 },
    { key: "claims", label: "Reality Claims", icon: Target, color: "text-blue-400", value: stages?.claims || 0 },
    { key: "consensus", label: "Consensus", icon: CheckCircle, color: "text-cyan-400", value: stages?.consensus || 0 },
    { key: "opportunities", label: "Opportunities", icon: Lightbulb, color: "text-emerald-400", value: stages?.opportunities || 0 },
    { key: "appsPublished", label: "Apps Published", icon: Beaker, color: "text-teal-400", value: stages?.appsPublished || 0 },
    { key: "installs", label: "Installs", icon: TrendingUp, color: "text-amber-400", value: stages?.installs || 0 },
    { key: "revenue", label: "Revenue", icon: DollarSign, color: "text-orange-400", value: stages?.revenue || 0 },
  ];

  return (
    <div data-testid="section-loop-visual">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {loopStages.map((stage, i) => {
          const Icon = stage.icon;
          return (
            <div key={stage.key} className="relative">
              <Card className="glass-card rounded-xl p-4 text-center hover:bg-white/[0.06] transition-all" data-testid={`card-loop-${stage.key}`}>
                <Icon className={cn("w-6 h-6 mx-auto mb-2", stage.color)} />
                <div className="text-lg font-bold">{typeof stage.value === 'number' && stage.key === 'revenue' ? `$${stage.value.toLocaleString()}` : stage.value.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">{stage.label}</div>
              </Card>
              {i < loopStages.length - 1 && (
                <div className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10">
                  <ArrowRight className="w-4 h-4 text-primary/40" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center mt-4 gap-2 text-xs text-muted-foreground">
        <Infinity className="w-4 h-4 text-primary" />
        <span>Revenue feeds back into intelligence systems, creating self-reinforcing growth</span>
      </div>
    </div>
  );
}

function PillarHealthCards({ pillars }: { pillars: any }) {
  if (!pillars) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="section-pillar-health">
      {Object.entries(pillarConfig).map(([key, config]) => {
        const pillar = pillars[key];
        if (!pillar) return null;
        const Icon = config.icon;
        const statusCfg = statusConfig[pillar.status] || statusConfig.moderate;
        const StatusIcon = statusCfg.icon;
        return (
          <Card key={key} className="glass-card rounded-xl p-5 hover:bg-white/[0.06] transition-all" data-testid={`card-pillar-${key}`}>
            <div className="flex items-center justify-between mb-3">
              <div className={cn("p-2 rounded-lg", config.bg)}>
                <Icon className={cn("w-5 h-5", config.color)} />
              </div>
              <StatusIcon className={cn("w-4 h-4", statusCfg.color)} />
            </div>
            <div className="text-2xl font-bold mb-1">{pillar.score}%</div>
            <div className="text-xs text-muted-foreground">{config.label}</div>
            <div className="mt-3 w-full bg-white/5 rounded-full h-1.5">
              <div
                className={cn("h-1.5 rounded-full transition-all", 
                  pillar.score >= 70 ? "bg-emerald-500" : pillar.score >= 40 ? "bg-amber-500" : "bg-red-500"
                )}
                style={{ width: `${pillar.score}%` }}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function CycleFunnel({ funnel }: { funnel: any[] }) {
  if (!funnel?.length) return null;
  return (
    <Card className="glass-card rounded-xl p-6" data-testid="section-cycle-funnel">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-primary" />
        Cycle Funnel
      </h3>
      <div className="space-y-3">
        {funnel.map((stage: any) => (
          <div key={stage.key} className="flex items-center gap-3">
            <div className="w-32 text-xs text-muted-foreground truncate">{stage.label}</div>
            <div className="flex-1 bg-white/5 rounded-full h-6 relative overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary/40 transition-all flex items-center justify-end pr-2"
                style={{ width: `${Math.max(stage.percentage, 5)}%` }}
              >
                <span className="text-[10px] font-medium">{stage.count}</span>
              </div>
            </div>
            <div className="w-12 text-right text-xs text-muted-foreground">{stage.percentage}%</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RevenueAttribution({ revenue }: { revenue: any }) {
  if (!revenue) return null;
  const byPillar = revenue.byPillar || [];
  const byStage = revenue.byStage || [];

  return (
    <Card className="glass-card rounded-xl p-6" data-testid="section-revenue-attribution">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-amber-400" />
        Revenue Attribution
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">By Pillar</h4>
          <div className="space-y-2">
            {byPillar.length > 0 ? byPillar.map((p: any) => {
              const config = pillarConfig[p.pillar];
              return (
                <div key={p.pillar} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03]">
                  <span className={cn("text-sm", config?.color || "text-muted-foreground")}>{config?.label || p.pillar}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{p.cycles} cycles</span>
                    <span className="text-sm font-medium">${Number(p.total).toLocaleString()}</span>
                  </div>
                </div>
              );
            }) : <p className="text-xs text-muted-foreground">No revenue data yet</p>}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">By Stage</h4>
          <div className="space-y-2">
            {byStage.length > 0 ? byStage.map((s: any) => (
              <div key={s.stage} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03]">
                <span className="text-sm capitalize">{s.stage}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{s.cycles} cycles</span>
                  <span className="text-sm font-medium">${Number(s.total).toLocaleString()}</span>
                </div>
              </div>
            )) : <p className="text-xs text-muted-foreground">No revenue data yet</p>}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function SuperLoop() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["/api/super-loop/summary"],
    queryFn: api.superLoop.summary,
  });

  const { data: health, isLoading: loadingHealth } = useQuery({
    queryKey: ["/api/super-loop/health"],
    queryFn: api.superLoop.health,
  });

  const { data: funnel } = useQuery({
    queryKey: ["/api/super-loop/funnel"],
    queryFn: api.superLoop.funnel,
  });

  const { data: revenue } = useQuery({
    queryKey: ["/api/super-loop/revenue"],
    queryFn: api.superLoop.revenue,
  });

  const snapshotMutation = useMutation({
    mutationFn: api.superLoop.snapshot,
    onSuccess: () => {
      toast({ title: "Snapshot captured", description: "Super-Loop metrics saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/super-loop"] });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: api.superLoop.trigger,
    onSuccess: (data) => {
      toast({ title: "Loop scan complete", description: `${data.cyclesCreated} new cycle events recorded` });
      queryClient.invalidateQueries({ queryKey: ["/api/super-loop"] });
    },
  });

  if (loadingSummary || loadingHealth) {
    return (
      <Layout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <Skeleton className="h-48" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-superloop-title">
              <div className="p-2 bg-primary/20 rounded-xl">
                <Infinity className="w-7 h-7 text-primary" />
              </div>
              Super-Loop
            </h1>
            <p className="text-muted-foreground mt-1">
              Continuous feedback loop: Ideas → Apps → Revenue → Knowledge
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending}
              data-testid="button-trigger"
            >
              <Zap className="w-4 h-4 mr-1" />
              Scan Loop
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => snapshotMutation.mutate()}
              disabled={snapshotMutation.isPending}
              data-testid="button-snapshot"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Snapshot
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="section-overview-stats">
          <Card className="glass-card rounded-xl p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Heart className="w-4 h-4 text-primary" />
              <span className="text-xs">Overall Health</span>
            </div>
            <div className="text-3xl font-bold">{health?.overall || 0}%</div>
            <div className="mt-2 w-full bg-white/5 rounded-full h-1.5">
              <div className={cn("h-1.5 rounded-full",
                (health?.overall || 0) >= 70 ? "bg-emerald-500" : (health?.overall || 0) >= 40 ? "bg-amber-500" : "bg-red-500"
              )} style={{ width: `${health?.overall || 0}%` }} />
            </div>
          </Card>
          <Card className="glass-card rounded-xl p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-xs">Loop Velocity</span>
            </div>
            <div className="text-3xl font-bold">{health?.velocity || 0}</div>
            <div className="text-xs text-muted-foreground mt-1">cycles/day</div>
          </Card>
          <Card className="glass-card rounded-xl p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-xs">Reinforcement</span>
            </div>
            <div className="text-3xl font-bold">{health?.reinforcement || 0}%</div>
            <div className="text-xs text-muted-foreground mt-1">self-reinforcing score</div>
          </Card>
          <Card className="glass-card rounded-xl p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <span className="text-xs">Active Cycles</span>
            </div>
            <div className="text-3xl font-bold">{summary?.cycles?.active || 0}</div>
            <div className="text-xs text-muted-foreground mt-1">{summary?.cycles?.completed || 0} completed</div>
          </Card>
        </div>

        <Card className="glass-card rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Infinity className="w-5 h-5 text-primary" />
            Intelligence → Application → Revenue Loop
          </h3>
          <LoopVisual stages={summary?.stages} />
        </Card>

        <PillarHealthCards pillars={health?.pillars} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CycleFunnel funnel={funnel || []} />
          <RevenueAttribution revenue={revenue} />
        </div>

        {(health?.bottlenecks?.length > 0 || health?.recommendations?.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {health?.bottlenecks?.length > 0 && (
              <Card className="glass-card rounded-xl p-6" data-testid="section-bottlenecks">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  Bottlenecks
                </h3>
                <div className="space-y-2">
                  {health.bottlenecks.map((b: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                      <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{b}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {health?.recommendations?.length > 0 && (
              <Card className="glass-card rounded-xl p-6" data-testid="section-recommendations">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-primary" />
                  Recommendations
                </h3>
                <div className="space-y-2">
                  {health.recommendations.map((r: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{r}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        <Card className="glass-card rounded-xl p-6" data-testid="section-how-it-works">
          <h3 className="text-lg font-bold mb-4">How the Super-Loop Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-violet-500/20 text-violet-400 border-violet-500/20">1</Badge>
                <span className="font-medium">Intelligence Generation</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Personal AI agents create interaction data. Users engage in debates. Reality Alignment verifies claims and builds consensus.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/20">2</Badge>
                <span className="font-medium">Application Creation</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Verified insights generate Labs opportunities. Creators prepare packages from these specs, then admin review decides whether they can appear as sandbox-only previews.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/20">3</Badge>
                <span className="font-medium">Economy & Feedback</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Sandbox usage and review signals generate analytics. No checkout, creator earnings, or production deployment is enabled in this loop.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
