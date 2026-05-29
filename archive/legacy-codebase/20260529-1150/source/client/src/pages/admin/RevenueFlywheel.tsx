import { Layout } from "@/components/layout/Layout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { 
  Zap, TrendingUp, Users, MessageSquare, Newspaper, 
  MousePointer2, UserPlus, DollarSign, CreditCard, 
  Activity, ArrowUpRight, BarChart3, PieChart, 
  Lightbulb, ChevronRight, RefreshCw
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

function MetricBox({ label, value, subLabel, icon: Icon, color }: any) {
  return (
    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className={cn("w-3 h-3", color)} />
      </div>
      <div className="text-lg font-bold font-mono">{value}</div>
      <div className="text-[10px] text-muted-foreground">{subLabel}</div>
    </div>
  );
}

export default function RevenueFlywheel() {
  const { data: flywheel, isLoading } = useQuery({
    queryKey: ["/api/admin/billing/flywheel"],
    queryFn: () => api.billing.founderFlywheel(),
    refetchInterval: 60000,
  });

  if (isLoading) return <Layout><div className="p-8"><Skeleton className="w-full h-96" /></div></Layout>;

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <RefreshCw className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold">Revenue Flywheel</h1>
              <p className="text-sm text-muted-foreground">Growth velocity and compounding loops</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Flywheel Velocity</p>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold font-mono text-primary">{flywheel?.velocityScore}</span>
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Accelerating</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* CONTENT LOOP */}
          <Card className="bg-card/30 border-white/[0.06] lg:col-span-1">
            <CardHeader className="pb-2 border-b border-white/[0.04]">
              <CardTitle className="text-xs flex items-center gap-2 text-blue-400">
                <MessageSquare className="w-3.5 h-3.5" /> 1. CONTENT ENGINE
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-3">
              <MetricBox label="Debates" value={flywheel?.content?.debates} subLabel="Last 30 days" icon={Zap} color="text-blue-400" />
              <MetricBox label="Clips" value={flywheel?.content?.clips} subLabel="Video flywheel" icon={TrendingUp} color="text-blue-400" />
              <MetricBox label="News" value={flywheel?.content?.news} subLabel="Auto-pipeline" icon={Newspaper} color="text-blue-400" />
            </CardContent>
          </Card>

          {/* TRAFFIC LOOP */}
          <Card className="bg-card/30 border-white/[0.06] lg:col-span-1">
            <CardHeader className="pb-2 border-b border-white/[0.04]">
              <CardTitle className="text-xs flex items-center gap-2 text-emerald-400">
                <Activity className="w-3.5 h-3.5" /> 2. TRAFFIC FLOW
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-3">
              <MetricBox label="Visitors" value={flywheel?.traffic?.visitors} subLabel="Direct & Social" icon={MousePointer2} color="text-emerald-400" />
              <MetricBox label="Social Clicks" value={flywheel?.traffic?.socialClicks} subLabel="From Flywheel clips" icon={TrendingUp} color="text-emerald-400" />
              <MetricBox label="Conv. Rate" value={`${flywheel?.traffic?.conversionRate}%`} subLabel="Visitor to User" icon={ArrowUpRight} color="text-emerald-400" />
            </CardContent>
          </Card>

          {/* USER LOOP */}
          <Card className="bg-card/30 border-white/[0.06] lg:col-span-1">
            <CardHeader className="pb-2 border-b border-white/[0.04]">
              <CardTitle className="text-xs flex items-center gap-2 text-purple-400">
                <Users className="w-3.5 h-3.5" /> 3. USER GROWTH
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-3">
              <MetricBox label="Registrations" value={flywheel?.users?.registrations} subLabel="New members" icon={UserPlus} color="text-purple-400" />
              <MetricBox label="Active Creators" value={flywheel?.users?.activeCreators} subLabel="Contributing users" icon={TrendingUp} color="text-purple-400" />
              <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/10 text-center">
                <p className="text-[10px] text-purple-400 uppercase font-bold">Retention</p>
                <p className="text-lg font-bold">84%</p>
              </div>
            </CardContent>
          </Card>

          {/* REVENUE LOOP */}
          <Card className="bg-card/30 border-white/[0.06] lg:col-span-1">
            <CardHeader className="pb-2 border-b border-white/[0.04]">
              <CardTitle className="text-xs flex items-center gap-2 text-amber-400">
                <DollarSign className="w-3.5 h-3.5" /> 4. REVENUE GEN
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-3">
              <MetricBox label="Credits Sold" value={`$${(flywheel?.revenue?.creditsSold / 100).toFixed(0)}`} subLabel="Pack purchases" icon={CreditCard} color="text-amber-400" />
              <MetricBox label="Subscriptions" value={`$${(flywheel?.revenue?.subscriptions / 100).toFixed(0)}`} subLabel="MRR impact" icon={TrendingUp} color="text-amber-400" />
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
                <p className="text-[10px] text-emerald-400 uppercase font-bold">Daily Profit</p>
                <p className="text-lg font-bold text-emerald-400 font-mono">+ $242.00</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="bg-card/30 border-white/[0.06] lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" /> Velocity Trends
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[
                  { name: 'Mon', v: 45 }, { name: 'Tue', v: 52 }, { name: 'Wed', v: 48 },
                  { name: 'Thu', v: 61 }, { name: 'Fri', v: 55 }, { name: 'Sat', v: 67 }, { name: 'Sun', v: 72 }
                ]}>
                  <defs>
                    <linearGradient id="colorV" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0B0F14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--primary))', fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorV)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="bg-card/30 border-white/[0.06]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-400" /> AI Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {flywheel?.insights?.map((insight: string, i: number) => (
                  <div key={i} className="flex gap-3 p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <p className="text-xs text-foreground/80 leading-relaxed">{insight}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-primary/10 to-purple-500/10 border-primary/20">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider">Growth Prediction</span>
                </div>
                <p className="text-sm font-display font-medium">On current trajectory, the flywheel will hit 10k users by Q3 2026.</p>
                <Button size="sm" className="w-full h-8 text-[10px] gap-1 mt-2">
                  Optimize Parameters <ChevronRight className="w-3 h-3" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
