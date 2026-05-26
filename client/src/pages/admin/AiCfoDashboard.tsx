import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain, IndianRupee, TrendingUp, TrendingDown, Users, Server,
  Cpu, Wifi, HeadphonesIcon, AlertTriangle, Lightbulb,
  BarChart3, Shield, Activity, Target, ChevronRight
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const severityColors: Record<string, string> = {
  info: "border-blue-500/30 bg-blue-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  critical: "border-red-500/30 bg-red-500/5",
  opportunity: "border-emerald-500/30 bg-emerald-500/5",
};

const severityBadge: Record<string, string> = {
  info: "bg-blue-500/20 text-blue-400",
  warning: "bg-amber-500/20 text-amber-400",
  critical: "bg-red-500/20 text-red-400",
  opportunity: "bg-emerald-500/20 text-emerald-400",
};

const alertSeverityStyles: Record<string, string> = {
  critical: "border-red-500/40 bg-red-500/10 text-red-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  info: "border-blue-500/40 bg-blue-500/10 text-blue-300",
};

export default function AiCfoDashboard() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["/api/ai-cfo/founder-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/ai-cfo/founder-dashboard");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 max-w-6xl mx-auto space-y-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-32 bg-zinc-800/50 rounded-xl" />)}
        </div>
      </Layout>
    );
  }

  const { revenue, costs, users: userMetrics, health, recommendations, forecasts, alerts, mode } = dashboard || {};

  return (
    <Layout>
      <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">AI CFO Dashboard</h1>
            <p className="text-zinc-400 text-sm">Ecosystem financial intelligence & optimization</p>
          </div>
          <Badge variant="outline" className="ml-auto text-[10px] px-2 py-0.5 bg-cyan-500/10 text-cyan-400 border-cyan-500/20" data-testid="badge-mode">
            {mode === "recommendation_only" ? "Recommendation Only" : "Active"}
          </Badge>
        </div>

        {alerts && alerts.length > 0 && (
          <div className="space-y-2" data-testid="section-alerts">
            {alerts.map((alert: any, i: number) => (
              <div key={i} className={cn("rounded-lg p-3 border flex items-center gap-3", alertSeverityStyles[alert.severity])} data-testid={`alert-${i}`}>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="text-sm">{alert.message}</span>
                <Badge className={cn("ml-auto text-[10px]", severityBadge[alert.severity])}>{alert.severity}</Badge>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="section-revenue-metrics">
          {[
            { label: "Platform Revenue", value: `₹${(revenue?.totalPlatformRevenue || 0).toLocaleString()}`, icon: IndianRupee, color: "text-emerald-400", testId: "stat-total-revenue" },
            { label: "MRR", value: `₹${(revenue?.monthlyRecurringRevenue || 0).toLocaleString()}`, icon: TrendingUp, color: "text-blue-400", testId: "stat-mrr" },
            { label: "ARPU", value: `₹${(revenue?.averageRevenuePerUser || 0).toLocaleString()}`, icon: Target, color: "text-violet-400", testId: "stat-arpu" },
            { label: "Total Users", value: (userMetrics?.totalUsers || 0).toLocaleString(), icon: Users, color: "text-amber-400", testId: "stat-total-users" },
          ].map((stat) => (
            <Card key={stat.label} className="glass-card rounded-xl p-4" data-testid={stat.testId}>
              <div className="flex items-center gap-1.5 mb-2">
                <stat.icon className={cn("w-3.5 h-3.5", stat.color)} />
                <span className="text-[11px] text-zinc-500 uppercase tracking-wider">{stat.label}</span>
              </div>
              <p className="text-xl font-bold">{stat.value}</p>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="glass-card rounded-xl p-5" data-testid="section-cost-breakdown">
            <div className="flex items-center gap-2 mb-4">
              <Server className="w-5 h-5 text-zinc-400" />
              <h2 className="text-lg font-semibold">Operational Costs</h2>
              <Badge variant="outline" className="ml-auto text-[10px]">Monthly</Badge>
            </div>
            <div className="space-y-3">
              {[
                { label: "AI Compute", value: costs?.estimatedAiComputeCost || 0, icon: Cpu, color: "text-violet-400" },
                { label: "Hosting", value: costs?.estimatedHostingCost || 0, icon: Server, color: "text-blue-400" },
                { label: "Bandwidth", value: costs?.estimatedBandwidthCost || 0, icon: Wifi, color: "text-emerald-400" },
                { label: "Support", value: costs?.estimatedSupportCost || 0, icon: HeadphonesIcon, color: "text-amber-400" },
              ].map((cost) => (
                <div key={cost.label} className="flex items-center justify-between" data-testid={`cost-${cost.label.toLowerCase().replace(" ", "-")}`}>
                  <div className="flex items-center gap-2">
                    <cost.icon className={cn("w-4 h-4", cost.color)} />
                    <span className="text-sm text-zinc-400">{cost.label}</span>
                  </div>
                  <span className="text-sm font-mono font-semibold">₹{cost.value.toLocaleString()}</span>
                </div>
              ))}
              <div className="border-t border-zinc-700/50 pt-2 flex justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-sm font-mono font-bold" data-testid="text-total-cost">₹{(costs?.totalOperationalCost || 0).toLocaleString()}</span>
              </div>
            </div>
          </Card>

          <Card className="glass-card rounded-xl p-5" data-testid="section-health-indicators">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-zinc-400" />
              <h2 className="text-lg font-semibold">Health Indicators</h2>
            </div>
            <div className="space-y-3">
              {[
                { label: "Gross Margin", value: `${health?.grossMargin || 0}%`, good: (health?.grossMargin || 0) > 50 },
                { label: "Net Margin", value: `${health?.netMargin || 0}%`, good: (health?.netMargin || 0) > 20 },
                { label: "LTV/CAC Ratio", value: `${health?.ltvCacRatio || 0}x`, good: (health?.ltvCacRatio || 0) > 3 },
                { label: "Runway", value: health?.runway || "N/A", good: true },
                { label: "Conversion Rate", value: `${userMetrics?.conversionRate || 0}%`, good: (userMetrics?.conversionRate || 0) > 5 },
                { label: "Retention Rate", value: `${userMetrics?.retentionRate || 0}%`, good: (userMetrics?.retentionRate || 0) > 90 },
              ].map((ind) => (
                <div key={ind.label} className="flex items-center justify-between" data-testid={`health-${ind.label.toLowerCase().replace(/[\s/]/g, "-")}`}>
                  <span className="text-sm text-zinc-400">{ind.label}</span>
                  <span className={cn("text-sm font-semibold", ind.good ? "text-emerald-400" : "text-amber-400")}>
                    {ind.value}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="glass-card rounded-xl p-6" data-testid="section-forecast">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold">6-Month Platform Forecast</h2>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {(forecasts || []).map((f: any, i: number) => {
              const maxRev = Math.max(...(forecasts || []).map((x: any) => x.revenue), 1);
              const revH = (f.revenue / maxRev) * 100;
              const costH = (f.costs / maxRev) * 100;
              return (
                <div key={i} className="text-center" data-testid={`forecast-${i}`}>
                  <div className="h-28 flex items-end justify-center gap-1 mb-1">
                    <div className="w-4 rounded-t bg-gradient-to-t from-emerald-600 to-emerald-400" style={{ height: `${Math.max(revH, 5)}%` }} />
                    <div className="w-4 rounded-t bg-gradient-to-t from-red-600 to-red-400" style={{ height: `${Math.max(costH, 5)}%` }} />
                  </div>
                  <p className="text-xs font-mono font-semibold text-emerald-400">₹{f.revenue.toLocaleString()}</p>
                  <p className="text-[10px] font-mono text-red-400">-₹{f.costs.toLocaleString()}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{f.month}</p>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 justify-center text-[11px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Revenue</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Costs</span>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="section-revenue-streams">
          {[
            { label: "Subscriptions", value: revenue?.totalSubscriptionRevenue || 0, color: "text-blue-400", bg: "from-blue-600 to-blue-400" },
            { label: "Credits", value: revenue?.totalCreditRevenue || 0, color: "text-violet-400", bg: "from-violet-600 to-violet-400" },
            { label: "Marketplace", value: revenue?.totalMarketplaceRevenue || 0, color: "text-emerald-400", bg: "from-emerald-600 to-emerald-400" },
          ].map((stream) => (
            <Card key={stream.label} className="glass-card rounded-xl p-4" data-testid={`revenue-${stream.label.toLowerCase()}`}>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">{stream.label}</p>
              <p className={cn("text-xl font-bold", stream.color)}>₹{stream.value.toLocaleString()}</p>
            </Card>
          ))}
        </div>

        <Card className="glass-card rounded-xl p-6" data-testid="section-recommendations">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold">AI CFO Recommendations</h2>
            <Badge variant="outline" className="ml-auto text-[10px] px-2">{(recommendations || []).length} insights</Badge>
          </div>
          <div className="space-y-3">
            {(recommendations || []).map((rec: any) => (
              <div key={rec.id} className={cn("rounded-lg p-4 border", severityColors[rec.severity])} data-testid={`recommendation-${rec.id}`}>
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px]", severityBadge[rec.severity])}>{rec.type}</Badge>
                    <h3 className="text-sm font-semibold">{rec.title}</h3>
                  </div>
                  {rec.estimatedGain > 0 && (
                    <Badge variant="outline" className="text-[10px] px-2 border-emerald-500/30 text-emerald-400">
                      +₹{rec.estimatedGain.toLocaleString()}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1">{rec.description}</p>
                <p className="text-xs text-zinc-500 mt-1 italic">{rec.impact}</p>
                <p className="text-xs text-primary mt-2 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" /> {rec.action}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <div className="text-center text-xs text-zinc-600 pb-4" data-testid="section-footer">
          AI CFO operates in recommendation-only mode. All pricing and financial decisions require founder approval.
        </div>
      </div>
    </Layout>
  );
}
