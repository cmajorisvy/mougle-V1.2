import { Layout } from "@/components/layout/Layout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Users, Zap, Target, Brain, Mic, GraduationCap,
  Store, Sparkles, ArrowUpRight, Crown, Eye, MousePointer, DollarSign,
  BarChart3, Activity
} from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  curious: "Curious Visitor",
  exploring: "Active Explorer",
  engaged: "Engaged Member",
  invested: "Invested User",
  habitual: "Daily Habit",
  advocate: "Platform Advocate",
  dependent: "Core Member",
};

const STAGE_COLORS: Record<string, string> = {
  curious: "bg-slate-500/20 text-slate-400",
  exploring: "bg-blue-500/20 text-blue-400",
  engaged: "bg-emerald-500/20 text-emerald-400",
  invested: "bg-amber-500/20 text-amber-400",
  habitual: "bg-orange-500/20 text-orange-400",
  advocate: "bg-purple-500/20 text-purple-400",
  dependent: "bg-pink-500/20 text-pink-400",
};

const TRIGGER_INFO: Record<string, { icon: any; label: string; color: string }> = {
  memory_limit: { icon: Brain, label: "Memory Limit", color: "text-blue-400" },
  advanced_reasoning: { icon: Sparkles, label: "Advanced Reasoning", color: "text-purple-400" },
  voice_access: { icon: Mic, label: "Voice Access", color: "text-emerald-400" },
  agent_training: { icon: GraduationCap, label: "Entity Training", color: "text-amber-400" },
  marketplace_publish: { icon: Store, label: "Sandbox Review", color: "text-pink-400" },
};

function StatCard({ icon: Icon, label, value, subValue, color }: { icon: any; label: string; value: string | number; subValue?: string; color: string }) {
  return (
    <Card className="bg-card/40 border-white/[0.06]">
      <CardContent className="p-4">
        <div className={cn("p-2 rounded-xl w-fit", color)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="mt-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold font-mono mt-0.5" data-testid={`text-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
          {subValue && <p className="text-[10px] text-muted-foreground mt-0.5">{subValue}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ConversionFunnel({ data }: { data: Record<string, { prompts: number; clicks: number; conversions: number; rate: number }> }) {
  const stages = Object.entries(data);
  const maxPrompts = Math.max(...stages.map(([, v]) => v.prompts), 1);

  return (
    <Card className="bg-card/30 border-white/[0.06]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          Conversion by Psychology Stage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.map(([stage, metrics]) => (
          <div key={stage} className="space-y-1.5" data-testid={`funnel-stage-${stage}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn("text-[9px] px-1.5", STAGE_COLORS[stage])}>
                  {STAGE_LABELS[stage] || stage}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {metrics.prompts}</span>
                <span className="flex items-center gap-1"><MousePointer className="w-3 h-3" /> {metrics.clicks}</span>
                <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {metrics.conversions}</span>
                <Badge variant="outline" className={cn("text-[9px]",
                  metrics.rate > 5 ? "border-emerald-500/20 text-emerald-400" :
                  metrics.rate > 0 ? "border-amber-500/20 text-amber-400" :
                  "border-white/10 text-muted-foreground"
                )}>
                  {metrics.rate}%
                </Badge>
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.04] overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", STAGE_COLORS[stage]?.replace("text-", "bg-") || "bg-slate-500/40")}
                style={{ width: `${Math.max((metrics.prompts / maxPrompts) * 100, 2)}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TriggerBreakdown({ data }: { data: Record<string, { prompts: number; conversions: number; rate: number }> }) {
  return (
    <Card className="bg-card/30 border-white/[0.06]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          Conversion by Trigger
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(data).map(([trigger, metrics]) => {
          const info = TRIGGER_INFO[trigger];
          if (!info) return null;
          const TIcon = info.icon;
          return (
            <div key={trigger} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]" data-testid={`trigger-${trigger}`}>
              <div className="flex items-center gap-3">
                <TIcon className={cn("w-4 h-4", info.color)} />
                <span className="text-sm">{info.label}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">{metrics.prompts} shown</span>
                <span className="text-muted-foreground">{metrics.conversions} converted</span>
                <Badge variant="outline" className={cn("text-[9px]",
                  metrics.rate > 5 ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" :
                  metrics.rate > 0 ? "border-amber-500/20 text-amber-400 bg-amber-500/5" :
                  "border-white/10"
                )}>
                  {metrics.rate}%
                </Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ConversionTimeline({ data }: { data: { date: string; prompts: number; conversions: number }[] }) {
  const maxValue = Math.max(...data.map(d => d.prompts), 1);

  return (
    <Card className="bg-card/30 border-white/[0.06]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          30-Day Conversion Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-0.5 h-32" data-testid="conversion-timeline">
          {data.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${day.date}: ${day.prompts} prompts, ${day.conversions} conversions`}>
              <div className="w-full flex flex-col-reverse gap-0.5">
                <div
                  className="w-full rounded-t bg-blue-500/40"
                  style={{ height: `${Math.max((day.prompts / maxValue) * 100, 1)}px` }}
                />
                {day.conversions > 0 && (
                  <div
                    className="w-full rounded-t bg-emerald-500/60"
                    style={{ height: `${Math.max((day.conversions / maxValue) * 100, 2)}px` }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[9px] text-muted-foreground">{data[0]?.date}</span>
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500/40" /> Prompts</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/60" /> Gate accepts</span>
          </div>
          <span className="text-[9px] text-muted-foreground">{data[data.length - 1]?.date}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentEvents({ events }: { events: any[] }) {
  return (
    <Card className="bg-card/30 border-white/[0.06]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          Recent Feature-Gate Events
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No events recorded yet</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {events.map((event: any, i: number) => {
              const info = TRIGGER_INFO[event.triggerType];
              const TIcon = info?.icon || Zap;
              return (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                  <div className="flex items-center gap-2.5">
                    <TIcon className={cn("w-3.5 h-3.5", info?.color || "text-muted-foreground")} />
                    <div>
                      <p className="text-xs font-medium">{event.eventType.replace(/_/g, " ")}</p>
                      <p className="text-[10px] text-muted-foreground">{info?.label || event.triggerType}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[8px]", STAGE_COLORS[event.psychologyStage])}>
                      {STAGE_LABELS[event.psychologyStage] || event.psychologyStage}
                    </Badge>
                    {event.converted && (
                      <Badge className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Converted</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TierOverview() {
  const { data: tiers } = useQuery({
    queryKey: ["/api/monetization/tiers"],
    queryFn: () => fetch("/api/monetization/tiers").then(r => r.json()),
  });

  if (!tiers) return null;

  const tierEntries = Object.entries(tiers) as [string, any][];
  const tierColors: Record<string, string> = { free: "border-slate-500/20", pro: "border-purple-500/20", creator: "border-amber-500/20" };
  const tierIcons: Record<string, any> = { free: Users, pro: Crown, creator: GraduationCap };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {tierEntries.map(([key, tier]) => {
        const TIcon = tierIcons[key] || Users;
        return (
          <Card key={key} className={cn("bg-card/30 border-white/[0.06]", tierColors[key])} data-testid={`tier-card-${key}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TIcon className="w-4 h-4 text-primary" />
                {tier.name}
                {tier.price > 0 && <span className="text-xs text-muted-foreground ml-auto">${(tier.price / 100).toFixed(0)}/mo</span>}
                {tier.price === 0 && <span className="text-xs text-emerald-400 ml-auto">Free</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {tier.features.map((f: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  {f}
                </div>
              ))}
              <div className="pt-2 text-[10px] text-muted-foreground">
                Memory: {tier.memoryLimit} slots
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function FeatureGatesView() {
  const { data: gates } = useQuery({
    queryKey: ["/api/monetization/feature-gates"],
    queryFn: () => fetch("/api/monetization/feature-gates").then(r => r.json()),
  });

  if (!gates) return null;

  return (
    <Card className="bg-card/30 border-white/[0.06]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          Feature Gates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(gates as any[]).map((gate: any) => {
          const info = TRIGGER_INFO[gate.triggerType];
          const TIcon = info?.icon || Zap;
          return (
            <div key={gate.feature} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]" data-testid={`gate-${gate.feature}`}>
              <div className="flex items-center gap-3">
                <TIcon className={cn("w-4 h-4", info?.color || "text-muted-foreground")} />
                <div>
                  <p className="text-sm font-medium">{gate.description}</p>
                  <p className="text-[10px] text-muted-foreground">{gate.feature}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px]">{gate.requiredPlan}</Badge>
                {gate.creditsCost > 0 && (
                  <Badge variant="outline" className="text-[9px] border-amber-500/20 text-amber-400">
                    {gate.creditsCost} credits
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function MonetizationAnalytics() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ["/api/monetization/analytics"],
    queryFn: () => fetch("/api/monetization/analytics").then(r => r.json()),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="w-64 h-8" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="bg-card/30 border-white/[0.06] p-4"><Skeleton className="w-full h-20" /></Card>)}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold" data-testid="text-monetization-title">Readiness and Feature-Gate Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Track conversion timing relative to user engagement stages</p>
        </div>

        <Tabs defaultValue="analytics" className="space-y-4">
          <TabsList className="bg-card/30 border border-white/[0.06]">
            <TabsTrigger value="analytics" data-testid="tab-analytics">
              <TrendingUp className="w-3.5 h-3.5 mr-1.5" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="tiers" data-testid="tab-tiers">
              <Crown className="w-3.5 h-3.5 mr-1.5" /> Tiers & Gates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <StatCard icon={Eye} label="Prompts Shown" value={analytics?.totalPromptsShown || 0} color="bg-blue-500/10 text-blue-400" />
              <StatCard icon={MousePointer} label="Prompt Clicks" value={analytics?.totalPromptClicks || 0} subValue={`${analytics?.clickThroughRate || 0}% CTR`} color="bg-amber-500/10 text-amber-400" />
              <StatCard icon={DollarSign} label="Gate Accepts" value={analytics?.totalConversions || 0} subValue={`${analytics?.overallConversionRate || 0}% rate`} color="bg-emerald-500/10 text-emerald-400" />
              <StatCard icon={Target} label="Accept Rate" value={`${analytics?.overallConversionRate || 0}%`} color="bg-purple-500/10 text-purple-400" />
              <StatCard icon={TrendingUp} label="Avg Engagement at Accept" value={analytics?.avgEngagementAtConversion || 0} color="bg-pink-500/10 text-pink-400" />
            </div>

            {analytics?.conversionTimeline && (
              <ConversionTimeline data={analytics.conversionTimeline} />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {analytics?.conversionsByStage && (
                <ConversionFunnel data={analytics.conversionsByStage} />
              )}
              {analytics?.conversionsByTrigger && (
                <TriggerBreakdown data={analytics.conversionsByTrigger} />
              )}
            </div>

            <RecentEvents events={analytics?.recentEvents || []} />
          </TabsContent>

          <TabsContent value="tiers" className="space-y-4">
            <TierOverview />
            <FeatureGatesView />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
