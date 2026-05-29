import { Layout } from "@/components/layout/Layout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DollarSign, TrendingUp, TrendingDown, Users, CreditCard, Zap,
  ArrowUpRight, ArrowDownRight, PieChart, BarChart3, Target, AlertTriangle,
  ChevronLeft
} from "lucide-react";
import { useLocation } from "wouter";

function MetricCard({ icon: Icon, label, value, subValue, trend, color }: any) {
  return (
    <Card className="bg-card/40 border-white/[0.06]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className={cn("p-2 rounded-xl", color)}><Icon className="w-4 h-4" /></div>
          {trend !== undefined && (
            <Badge variant="outline" className={cn("text-[9px] gap-0.5", trend >= 0 ? "border-emerald-500/20 text-emerald-400" : "border-red-500/20 text-red-400")}>
              {trend >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
              {Math.abs(trend)}%
            </Badge>
          )}
        </div>
        <div className="mt-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold font-mono mt-0.5">{value}</p>
          {subValue && <p className="text-[10px] text-muted-foreground mt-0.5">{subValue}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function RevenueAnalytics() {
  const [, navigate] = useLocation();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["/api/admin/billing/analytics"],
    queryFn: () => api.billing.founderAnalytics(),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="w-64 h-8" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <Card key={i} className="bg-card/30 border-white/[0.06] p-4"><Skeleton className="w-full h-20" /></Card>)}
          </div>
        </div>
      </Layout>
    );
  }

  const marginPct = analytics?.margin !== undefined ? Math.round(analytics.margin * 100) : 0;
  const isHealthy = marginPct > 20;

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/admin")} data-testid="button-back-admin">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="p-2 rounded-xl bg-emerald-500/10">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold" data-testid="text-revenue-title">Revenue Analytics</h1>
              <p className="text-sm text-muted-foreground">Compute credit billing health and performance</p>
            </div>
          </div>
          <Badge variant="outline" className={cn(
            "text-xs gap-1",
            isHealthy ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5" : "border-amber-500/20 text-amber-400 bg-amber-500/5"
          )} data-testid="badge-margin-health">
            {isHealthy ? <TrendingUp className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            Margin: {marginPct}%
          </Badge>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            icon={DollarSign} label="Total Revenue" color="bg-emerald-500/10 text-emerald-400"
            value={`$${((analytics?.totalRevenue || 0) / 100).toFixed(2)}`}
            subValue="All time"
          />
          <MetricCard
            icon={CreditCard} label="Credits Purchased" color="bg-blue-500/10 text-blue-400"
            value={analytics?.totalCreditsPurchased || 0}
            subValue="Total credits sold"
          />
          <MetricCard
            icon={Zap} label="Credits Used" color="bg-purple-500/10 text-purple-400"
            value={analytics?.totalCreditsUsed || 0}
            subValue="Total consumed"
          />
          <MetricCard
            icon={Target} label="Circulating" color="bg-amber-500/10 text-amber-400"
            value={analytics?.totalCreditsCirculating || 0}
            subValue="Compute credits tracked"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-card/30 border-white/[0.06]" data-testid="card-cost-analysis">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /> Cost vs Income Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Revenue (from credit/sub sales)</span>
                  <span className="text-sm font-bold text-emerald-400 font-mono">${((analytics?.totalRevenue || 0) / 100).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Est. AI Costs (OpenAI, compute)</span>
                  <span className="text-sm font-bold text-red-400 font-mono">-${((analytics?.costEstimate || 0) / 100).toFixed(2)}</span>
                </div>
                <div className="border-t border-white/[0.06] pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">Net Margin</span>
                  <span className={cn("text-base font-bold font-mono", isHealthy ? "text-emerald-400" : "text-amber-400")}>
                    ${(((analytics?.totalRevenue || 0) - (analytics?.costEstimate || 0)) / 100).toFixed(2)} ({marginPct}%)
                  </span>
                </div>
              </div>
              <div className="w-full h-3 bg-white/[0.04] rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500/60 rounded-l-full" style={{ width: `${Math.max(0, marginPct)}%` }} />
                <div className="h-full bg-red-500/40 rounded-r-full flex-1" />
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Profit ({marginPct}%)</span>
                <span>AI Costs ({100 - marginPct}%)</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/30 border-white/[0.06]" data-testid="card-subscription-breakdown">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><PieChart className="w-4 h-4 text-purple-400" /> Subscription Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Active Subscribers</span>
                <span className="text-lg font-bold font-mono" data-testid="text-active-subs">{analytics?.activeSubscribers || 0}</span>
              </div>
              {analytics?.subscriptionBreakdown && Object.entries(analytics.subscriptionBreakdown).map(([plan, count]: [string, any]) => {
                const colors: Record<string, string> = {
                  free: "bg-gray-400/20 text-gray-400",
                  creator: "bg-blue-400/20 text-blue-400",
                  pro: "bg-purple-400/20 text-purple-400",
                  expert: "bg-amber-400/20 text-amber-400",
                };
                return (
                  <div key={plan} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]" data-testid={`sub-plan-${plan}`}>
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", colors[plan]?.split(" ")[0] || "bg-gray-400/20")} />
                      <span className="text-sm capitalize font-medium">{plan}</span>
                    </div>
                    <span className="text-sm font-mono">{count}</span>
                  </div>
                );
              })}
              {analytics?.conversionRate !== undefined && (
                <div className="border-t border-white/[0.06] pt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Conversion Rate (free to paid)</span>
                  <span className="text-sm font-bold text-primary font-mono" data-testid="text-conversion-rate">{(analytics.conversionRate * 100).toFixed(1)}%</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card/30 border-white/[0.06]" data-testid="card-revenue-by-type">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400" /> Revenue by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {analytics?.revenueByType && Object.entries(analytics.revenueByType).map(([type, amount]: [string, any]) => (
                <div key={type} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center" data-testid={`revenue-${type}`}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider capitalize">{type.replace(/_/g, " ")}</p>
                  <p className="text-lg font-bold font-mono text-emerald-400 mt-1">${(amount / 100).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
