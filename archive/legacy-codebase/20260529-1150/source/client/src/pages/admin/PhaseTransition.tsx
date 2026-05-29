import { Layout } from "@/components/layout/Layout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity, Users, DollarSign, TrendingUp, Bot, FileText, UserCheck,
  CheckCircle2, ArrowUpRight, ArrowDownRight, Minus, Target, AlertTriangle,
  Compass, Sprout, Globe, ChevronRight, RefreshCw, Lightbulb
} from "lucide-react";

const PHASE_ICONS = [Compass, Sprout, Globe];
const PHASE_COLORS = [
  { bg: "from-blue-500/10 to-cyan-500/10", border: "border-blue-500/20", text: "text-blue-400", ring: "ring-blue-500/20" },
  { bg: "from-emerald-500/10 to-teal-500/10", border: "border-emerald-500/20", text: "text-emerald-400", ring: "ring-emerald-500/20" },
  { bg: "from-purple-500/10 to-pink-500/10", border: "border-purple-500/20", text: "text-purple-400", ring: "ring-purple-500/20" },
];

const METRIC_CONFIG = [
  { key: "userGeneratedTraffic", label: "User-Generated Traffic", icon: Users, desc: "Percentage of content created by users vs AI", suffix: "%", color: "text-blue-400" },
  { key: "creatorRevenueGrowth", label: "Creator Revenue Growth", icon: DollarSign, desc: "Active creators with growing revenue", suffix: "%", color: "text-emerald-400" },
  { key: "aiActivityRatio", label: "AI Activity Ratio", icon: Bot, desc: "AI share of total platform activity (ideal ~30%)", suffix: "%", color: "text-amber-400" },
  { key: "organicContent", label: "Organic Content", icon: FileText, desc: "Content created without founder action", suffix: "%", color: "text-violet-400" },
  { key: "userRetention", label: "User Retention", icon: UserCheck, desc: "Users returning within a week", suffix: "%", color: "text-teal-400" },
];

const SIGNAL_STYLES: Record<string, { icon: any; color: string; bg: string }> = {
  strong: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/15" },
  emerging: { icon: TrendingUp, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/15" },
  weak: { icon: AlertTriangle, color: "text-zinc-400", bg: "bg-white/[0.03] border-white/[0.06]" },
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export default function PhaseTransitionMonitor() {
  const { data: ti, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/transition-index"],
    queryFn: () => api.billing.transitionIndex(),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-80" />
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3].map(i => <Skeleton key={i} className="h-40" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </Layout>
    );
  }

  const score = ti?.transitionScore || 0;
  const phase = ti?.phase || { id: 1, label: "Tool Stage", tag: "tool" };
  const phases = ti?.phases || [];
  const trend = ti?.trend || { direction: "stable", delta: 0 };
  const signals = ti?.signals || [];
  const governance = ti?.governance || { currentRole: "", actions: [], nextPhase: null, distanceToNext: 0 };
  const TrendIcon = trend.direction === "improving" ? ArrowUpRight : trend.direction === "declining" ? ArrowDownRight : Minus;
  const trendColor = trend.direction === "improving" ? "text-emerald-400" : trend.direction === "declining" ? "text-red-400" : "text-muted-foreground";

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="section-phase-transition">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Activity className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-phase-title">Phase Transition Monitor</h1>
              <p className="text-sm text-muted-foreground">Detecting when growth becomes self-sustaining</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn("flex items-center gap-1 text-xs", trendColor)} data-testid="text-trend">
              <TrendIcon className="w-3.5 h-3.5" />
              <span>{trend.direction} ({trend.delta > 0 ? "+" : ""}{trend.delta}%)</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-phase">
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="section-phase-steps">
          {phases.map((p: any, idx: number) => {
            const isCompleted = phase.id > p.id;
            const isCurrent = phase.id === p.id;
            const colors = PHASE_COLORS[idx] || PHASE_COLORS[0];
            const PhaseIcon = PHASE_ICONS[idx] || Compass;
            return (
              <Card key={p.id} className={cn(
                "rounded-xl transition-all relative overflow-hidden",
                isCurrent && `bg-gradient-to-br ${colors.bg} ${colors.border} ring-1 ${colors.ring}`,
                isCompleted && "opacity-50",
                !isCurrent && !isCompleted && "glass-card"
              )} data-testid={`card-phase-${p.tag}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={cn("text-[10px]", isCurrent && colors.text)}>
                      Phase {p.id}
                    </Badge>
                    {isCompleted ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                     isCurrent ? <PhaseIcon className={cn("w-5 h-5 animate-pulse", colors.text)} /> :
                     <PhaseIcon className="w-4 h-4 text-muted-foreground/30" />}
                  </div>
                  <div>
                    <h3 className="text-base font-bold" data-testid={`text-phase-label-${p.tag}`}>{p.label}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{p.description}</p>
                  </div>
                  {isCurrent && (
                    <div className="pt-2 border-t border-white/[0.06]">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Your Role</p>
                      <p className="text-xs">{p.founderRole}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="glass-card rounded-xl">
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  Transition Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="section-growth-metrics">
                  {METRIC_CONFIG.map(m => {
                    const Icon = m.icon;
                    const value = ti?.metrics?.[m.key] ?? 0;
                    const metricScore = ti?.scores?.[m.key] ?? 0;
                    return (
                      <Card key={m.key} className="glass-card rounded-xl p-4 hover:bg-white/[0.06] transition-all" data-testid={`card-metric-${m.key}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="p-2 rounded-lg bg-white/[0.05]">
                            <Icon className={cn("w-4 h-4", m.color)} />
                          </div>
                          <span className="text-lg font-bold font-mono" data-testid={`text-metric-${m.key}`}>
                            {typeof value === 'number' ? value.toFixed(1) : value}{m.suffix}
                          </span>
                        </div>
                        <div className="text-sm font-medium mb-1">{m.label}</div>
                        <div className="text-[10px] text-muted-foreground mb-3">{m.desc}</div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-muted-foreground">Score</span>
                            <span className="font-mono">{Math.round(metricScore)}%</span>
                          </div>
                          <Progress value={metricScore} className="h-1 bg-white/[0.04]" />
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {signals.length > 0 && (
              <Card className="glass-card rounded-xl" data-testid="section-signals">
                <CardHeader>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Transition Signals
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {signals.map((sig: any, i: number) => {
                    const style = SIGNAL_STYLES[sig.status] || SIGNAL_STYLES.weak;
                    const SigIcon = style.icon;
                    return (
                      <div key={i} className={cn("flex items-start gap-3 p-3 rounded-lg border", style.bg)} data-testid={`signal-${sig.metric}`}>
                        <SigIcon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", style.color)} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{sig.label}</span>
                            <Badge variant="outline" className={cn("text-[9px]", style.color)}>
                              {sig.status}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{sig.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className={cn(
              "flex flex-col items-center justify-center p-8 text-center space-y-4 rounded-xl",
              score >= 75 ? "bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20" :
              score >= 40 ? "bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-emerald-500/20" :
              "bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20"
            )} data-testid="section-transition-index">
              <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Transition Score</div>
              <div className="relative w-36 h-36">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle className="text-white/[0.05]" cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor" strokeWidth="3" />
                  <circle
                    className={cn(
                      score >= 75 ? "text-purple-400" : score >= 40 ? "text-emerald-400" : "text-blue-400"
                    )}
                    cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor" strokeWidth="3"
                    strokeLinecap="round" strokeDasharray={`${score} 100`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold font-mono" data-testid="text-transition-score">{score}%</span>
                  <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-tighter">transition</span>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold" data-testid="text-current-phase">
                  {phase.label}
                </h3>
                {ti?.selfSustaining && (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Self-Sustaining</Badge>
                )}
                <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                  {ti?.selfSustaining
                    ? "The platform has achieved self-propagating growth"
                    : governance.nextPhase
                      ? `${governance.distanceToNext > 0 ? governance.distanceToNext : 0} points to ${governance.nextPhase.label}`
                      : "Highest phase reached"}
                </p>
              </div>
            </Card>

            <Card className="glass-card rounded-xl p-5" data-testid="section-governance">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                Founder Governance Guide
              </h3>
              <div className="text-xs text-muted-foreground mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]" data-testid="text-founder-role">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1">Current Role</span>
                {governance.currentRole}
              </div>
              <div className="space-y-2">
                {governance.actions.map((a: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`governance-action-${i}`}>
                    <ChevronRight className="w-3 h-3 mt-1 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium">{a.action}</span>
                        <Badge variant="outline" className={cn("text-[8px]", PRIORITY_BADGE[a.priority])}>
                          {a.priority}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{a.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="glass-card rounded-xl p-5" data-testid="section-raw-stats">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                Raw Numbers
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Total Posts (30d)", value: ti?.metrics?.raw?.totalPosts ?? 0 },
                  { label: "User Posts", value: ti?.metrics?.raw?.userGeneratedPosts ?? 0 },
                  { label: "AI Posts", value: ti?.metrics?.raw?.aiGeneratedPosts ?? 0 },
                  { label: "Founder Posts", value: ti?.metrics?.raw?.founderPosts ?? 0 },
                  { label: "Non-Founder Content", value: ti?.metrics?.raw?.nonFounderContent ?? 0 },
                  { label: "Total Users (30d)", value: ti?.metrics?.raw?.totalUsers ?? 0 },
                  { label: "Active Users", value: ti?.metrics?.raw?.usersWithActivity ?? 0 },
                  { label: "Active Creators", value: ti?.metrics?.raw?.activeCreators ?? 0 },
                  { label: "AI Conversations", value: ti?.metrics?.raw?.aiConversations ?? 0 },
                  { label: "Posts This Week", value: ti?.metrics?.raw?.weeklyPosts ?? 0 },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-mono font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
