import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Layout } from "@/components/layout/Layout";
import { useAuth } from "@/context/AuthContext";
import {
  Brain, TrendingUp, Flame, MessageCircle, Heart, Trophy, Shield,
  BarChart3, Users, AlertTriangle, ArrowRight, Sparkles, Eye,
  Activity, Target, Zap, ChevronRight, Camera
} from "lucide-react";

const STAGE_ICONS: Record<string, any> = {
  curious: Eye, exploring: Sparkles, engaged: Heart, invested: Target,
  habitual: Flame, advocate: Trophy, dependent: Shield,
};

const STAGE_GRADIENTS: Record<string, string> = {
  curious: "from-slate-500 to-zinc-600",
  exploring: "from-blue-500 to-cyan-600",
  engaged: "from-violet-500 to-purple-600",
  invested: "from-amber-500 to-orange-600",
  habitual: "from-red-500 to-rose-600",
  advocate: "from-emerald-500 to-green-600",
  dependent: "from-indigo-500 to-blue-600",
};

const STAGE_TEXT: Record<string, string> = {
  curious: "text-slate-400", exploring: "text-blue-400", engaged: "text-violet-400",
  invested: "text-amber-400", habitual: "text-red-400", advocate: "text-emerald-400",
  dependent: "text-indigo-400",
};

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-500", neutral: "bg-zinc-500", medium: "bg-amber-500",
  high: "bg-orange-500", critical: "bg-red-500",
};

const INDICATOR_ICONS: Record<string, any> = {
  flame: Flame, brain: Brain, message: MessageCircle,
  chart: BarChart3, trophy: Trophy,
};

function UserIndicatorsTab() {
  const { user } = useAuth();
  const userId = user?.id || "";

  const { data, isLoading } = useQuery({
    queryKey: ["psychology-indicators", userId],
    queryFn: () => fetch("/api/psychology/indicators", { headers: { "x-user-id": userId } }).then(r => r.json()),
    enabled: !!userId,
  });

  const { data: stages } = useQuery({
    queryKey: ["psychology-stages"],
    queryFn: () => fetch("/api/psychology/stages").then(r => r.json()),
  });

  if (!userId) {
    return (
      <div className="space-y-6" data-testid="psychology-guest-view">
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-6 text-center">
            <Brain className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-zinc-300">Your Growth Journey</h3>
            <p className="text-sm text-zinc-500 mt-2">Sign in to see how your assistant grows with you</p>
          </CardContent>
        </Card>
        {stages && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-zinc-400">Engagement Journey</h4>
            {stages.map((s: any, i: number) => {
              const Icon = STAGE_ICONS[s.id] || Eye;
              return (
                <Card key={s.id} className={`border-zinc-800 ${i === 0 ? "bg-zinc-800/60" : "bg-zinc-900/30"}`} data-testid={`stage-preview-${s.id}`}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${i === 0 ? `bg-gradient-to-br ${STAGE_GRADIENTS[s.id]}` : "bg-zinc-800"}`}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <span className={`text-sm font-medium ${i === 0 ? STAGE_TEXT[s.id] : "text-zinc-600"}`}>{s.label}</span>
                      <p className="text-xs text-zinc-600">{s.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (isLoading) return <div className="text-zinc-400 p-4">Analyzing your growth pattern...</div>;
  if (!data?.stage) return <div className="text-zinc-400 p-4">Could not load indicators.</div>;

  const Icon = STAGE_ICONS[data.stage.id] || Eye;
  const gradient = STAGE_GRADIENTS[data.stage.id] || "from-slate-500 to-zinc-600";
  const textClass = STAGE_TEXT[data.stage.id] || "text-slate-400";

  return (
    <div className="space-y-6" data-testid="psychology-indicators">
      <Card className="bg-zinc-900/60 border-zinc-800 overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-xl bg-gradient-to-br ${gradient} shadow-lg`}>
              <Icon className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Your Intelligence Growth</p>
              <h2 className={`text-2xl font-bold ${textClass}`} data-testid="text-psychology-stage">{data.stage.label}</h2>
              <p className="text-sm text-zinc-400 mt-0.5">{data.stage.description}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white" data-testid="text-engagement-score">{Math.round(data.metrics.engagementScore)}</p>
              <p className="text-xs text-zinc-500">Engagement</p>
            </div>
          </div>
          {data.nextStage && (
            <div className="mt-5">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500">Growth toward {data.nextStage.label}</span>
                <span className={textClass}>{data.progressToNext}%</span>
              </div>
              <div className="h-2.5 bg-black/30 rounded-full overflow-hidden">
                <div className={`h-full bg-gradient-to-r ${gradient} rounded-full transition-all`} style={{ width: `${data.progressToNext}%` }} data-testid="psychology-progress-bar" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium text-zinc-300">AI Nudge</span>
          </div>
          <p className="text-sm text-zinc-400 italic" data-testid="text-nudge">"{data.stage.nudge}"</p>
        </CardContent>
      </Card>

      {data.growthIndicators.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Growth Indicators
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {data.growthIndicators.map((ind: any, i: number) => {
              const IIcon = INDICATOR_ICONS[ind.icon] || Zap;
              return (
                <Card key={i} className="bg-zinc-900/40 border-zinc-800" data-testid={`indicator-${ind.icon}`}>
                  <CardContent className="p-3 flex items-center gap-2">
                    <IIcon className={`h-4 w-4 ${ind.trend === "up" ? "text-emerald-400" : ind.trend === "new" ? "text-blue-400" : "text-zinc-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500 truncate">{ind.label}</p>
                      <p className="text-sm font-medium text-zinc-200">{ind.value}</p>
                    </div>
                    {ind.trend === "up" && <TrendingUp className="h-3 w-3 text-emerald-400" />}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium text-zinc-400 mb-3">Session Stats</h4>
        <div className="grid grid-cols-3 gap-2">
          <Card className="bg-zinc-900/40 border-zinc-800">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-white">{data.metrics.streakDays}</p>
              <p className="text-[10px] text-zinc-500">Day Streak</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/40 border-zinc-800">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-white">{data.metrics.conversationsPerDay}</p>
              <p className="text-[10px] text-zinc-500">Interactions/Day</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/40 border-zinc-800">
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-white">{data.metrics.memorySaves}</p>
              <p className="text-[10px] text-zinc-500">Memories</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {stages && (
        <div>
          <h4 className="text-sm font-medium text-zinc-400 mb-3">Engagement Journey</h4>
          <div className="space-y-1.5">
            {stages.map((s: any) => {
              const SIcon = STAGE_ICONS[s.id] || Eye;
              const isCurrent = s.id === data.stage.id;
              const isPast = stages.indexOf(s) < stages.findIndex((st: any) => st.id === data.stage.id);
              return (
                <div key={s.id} className={`flex items-center gap-3 p-2 rounded-lg ${isCurrent ? "bg-zinc-800/60 ring-1 ring-white/10" : ""}`} data-testid={`journey-stage-${s.id}`}>
                  <div className={`p-1.5 rounded-md ${isCurrent ? `bg-gradient-to-br ${STAGE_GRADIENTS[s.id]}` : isPast ? "bg-zinc-700" : "bg-zinc-900"}`}>
                    <SIcon className={`h-3.5 w-3.5 ${isCurrent || isPast ? "text-white" : "text-zinc-600"}`} />
                  </div>
                  <span className={`text-sm ${isCurrent ? STAGE_TEXT[s.id] + " font-medium" : isPast ? "text-zinc-400" : "text-zinc-600"}`}>{s.label}</span>
                  {isCurrent && <Badge className="ml-auto bg-white/10 text-white text-[9px]">You</Badge>}
                  {isPast && <ChevronRight className="ml-auto h-3 w-3 text-emerald-500" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FounderAnalyticsTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["psychology-founder-analytics"],
    queryFn: () => fetch("/api/psychology/founder/analytics").then(r => r.json()),
  });

  const snapshotMutation = useMutation({
    mutationFn: () => fetch("/api/psychology/founder/snapshot", { method: "POST" }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["psychology-founder-analytics"] }),
  });

  if (isLoading) return <div className="text-zinc-400 p-4">Loading analytics...</div>;
  if (!data) return <div className="text-zinc-400 p-4">No analytics available.</div>;

  const maxStageCount = Math.max(...(data.stageFlow || []).map((s: any) => s.count), 1);

  return (
    <div className="space-y-6" data-testid="psychology-founder-analytics">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">User Psychology Analytics</h3>
          <p className="text-sm text-zinc-500">Track emotional engagement and retention patterns</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => snapshotMutation.mutate()} disabled={snapshotMutation.isPending} data-testid="btn-take-snapshot">
          <Camera className="h-4 w-4 mr-1" /> Take Snapshot
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <Users className="h-5 w-5 text-blue-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white" data-testid="text-total-tracked">{data.totalTracked}</p>
            <p className="text-xs text-zinc-500">Tracked Users</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <BarChart3 className="h-5 w-5 text-violet-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white" data-testid="text-avg-engagement">{data.avgEngagementScore}</p>
            <p className="text-xs text-zinc-500">Avg Engagement</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white">{Math.round(data.avgReturnFrequency * 100)}%</p>
            <p className="text-xs text-zinc-500">Avg Return Rate</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <MessageCircle className="h-5 w-5 text-amber-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white">{data.avgConversationsPerDay}</p>
            <p className="text-xs text-zinc-500">Avg Interactions/Day</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Stage Funnel</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="space-y-2">
            {(data.stageFlow || []).map((stage: any) => {
              const Icon = STAGE_ICONS[stage.id] || Eye;
              const width = Math.max((stage.count / maxStageCount) * 100, 4);
              return (
                <div key={stage.id} className="flex items-center gap-3" data-testid={`funnel-${stage.id}`}>
                  <div className="w-28 flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${STAGE_TEXT[stage.id]}`} />
                    <span className="text-xs text-zinc-400 truncate">{stage.label}</span>
                  </div>
                  <div className="flex-1 h-6 bg-black/30 rounded overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${STAGE_GRADIENTS[stage.id]} rounded flex items-center px-2 transition-all`} style={{ width: `${width}%` }}>
                      <span className="text-[10px] font-bold text-white">{stage.count}</span>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500 w-10 text-right">{stage.percentage}%</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" /> Retention Risk Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex gap-2">
            {Object.entries(data.riskDistribution || {}).map(([risk, count]) => {
              const total = Object.values(data.riskDistribution || {}).reduce((a: number, b: any) => a + (b as number), 0) as number;
              const pct = total > 0 ? Math.round(((count as number) / total) * 100) : 0;
              return (
                <div key={risk} className="flex-1 text-center" data-testid={`risk-${risk}`}>
                  <div className={`h-2 ${RISK_COLORS[risk] || "bg-zinc-600"} rounded-full mb-2`} style={{ opacity: (count as number) > 0 ? 1 : 0.2 }} />
                  <p className="text-lg font-bold text-white">{count as number}</p>
                  <p className="text-[10px] text-zinc-500 capitalize">{risk}</p>
                  <p className="text-[9px] text-zinc-600">{pct}%</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {data.topUsers && data.topUsers.length > 0 && (
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300">Top Engaged Users</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="space-y-2">
              {data.topUsers.map((u: any, i: number) => {
                const Icon = STAGE_ICONS[u.stage] || Eye;
                return (
                  <div key={u.userId} className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/40" data-testid={`top-user-${i}`}>
                    <span className="text-xs text-zinc-500 w-5 text-right">{i + 1}</span>
                    <Icon className={`h-4 w-4 ${STAGE_TEXT[u.stage]}`} />
                    <span className="text-xs text-zinc-400 flex-1 truncate">{u.userId.slice(0, 8)}...</span>
                    <Badge variant="outline" className="text-[9px]">{u.stage}</Badge>
                    <span className="text-xs font-medium text-white">{Math.round(u.engagementScore)}</span>
                    {u.streakDays > 0 && (
                      <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                        <Flame className="h-3 w-3" />{u.streakDays}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function UserPsychology() {
  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex items-center gap-3 mb-6">
          <Brain className="h-8 w-8 text-violet-400" />
          <div>
            <h1 className="text-2xl font-bold text-white" data-testid="text-psychology-title">Growth & Engagement</h1>
            <p className="text-sm text-zinc-400">Your personal growth journey on the platform</p>
          </div>
        </div>

        <Tabs defaultValue="growth" className="space-y-4">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="growth" data-testid="tab-growth">My Growth</TabsTrigger>
            <TabsTrigger value="founder" data-testid="tab-founder">Founder Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="growth">
            <UserIndicatorsTab />
          </TabsContent>

          <TabsContent value="founder">
            <FounderAnalyticsTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
