import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, ShoppingBag, Package, Star,
  Lightbulb, BarChart3, Clock, ShieldCheck, ChevronRight, Sparkles
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

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

export default function CreatorFinance() {
  const { user } = useAuth();
  const userId = user?.id || "current-user";

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["/api/ai-cfo/creator-dashboard", userId],
    queryFn: async () => {
      const res = await fetch(`/api/ai-cfo/creator-dashboard/${userId}`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 max-w-5xl mx-auto space-y-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 bg-zinc-800/50 rounded-xl" />)}
        </div>
      </Layout>
    );
  }

  const { earnings, listings, apps, payoutAccount, recommendations, forecast } = dashboard || {
    earnings: { totalEarned: 0, netEarnings: 0, pendingEarnings: 0, settledEarnings: 0, transactionCount: 0, averageOrderValue: 0 },
    listings: { totalListings: 0, activeListings: 0, totalSales: 0, totalRevenue: 0, averageRating: 0 },
    apps: { totalApps: 0, publishedApps: 0, totalInstalls: 0, averageRating: 0 },
    payoutAccount: { exists: false, totalEarnings: 0, pendingAmount: 0 },
    recommendations: [],
    forecast: [],
  };

  return (
    <Layout>
      <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold" data-testid="text-page-title">Creator Readiness Intelligence</h1>
                <p className="text-zinc-400 text-sm">Recommendation-only sandbox signals. No payout, checkout, or creator earnings are active.</p>
              </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-violet-500/10 text-violet-400 border-violet-500/20" data-testid="badge-mode">
              Recommendation Mode
            </Badge>
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-300 border-amber-500/20">
              Earnings Disabled
            </Badge>
          </div>
        </div>

        <Card className="border-amber-500/20 bg-amber-500/10 rounded-xl p-4 text-sm text-amber-100" data-testid="notice-creator-finance-disabled">
          This page is a readiness preview only. It does not create payable balances, creator earnings, checkout, marketplace transactions, production deployment, or payout records.
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="section-earnings-overview">
          {[
            { label: "Review Signals", value: earnings.transactionCount.toLocaleString(), icon: TrendingUp, color: "text-emerald-400", testId: "stat-total-earned" },
            { label: "Net Readiness", value: "Preview", icon: ShieldCheck, color: "text-blue-400", testId: "stat-net-earnings" },
            { label: "Pending Review", value: "Disabled", icon: Clock, color: "text-amber-400", testId: "stat-pending" },
            { label: "Avg Sandbox Signal", value: "Preview", icon: ShoppingBag, color: "text-violet-400", testId: "stat-avg-order" },
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
          <Card className="glass-card rounded-xl p-5" data-testid="section-marketplace">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingBag className="w-5 h-5 text-zinc-400" />
              <h2 className="text-lg font-semibold">Safe Clone Sandbox</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-zinc-400">Sandbox Listings</span>
                <span className="text-sm font-semibold" data-testid="text-active-listings">{listings.activeListings} / {listings.totalListings}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-zinc-400">Sandbox Tests</span>
                <span className="text-sm font-semibold" data-testid="text-total-sales">{listings.totalSales}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-zinc-400">Checkout / Revenue</span>
                <span className="text-sm font-semibold text-amber-300" data-testid="text-marketplace-revenue">Disabled</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-zinc-400">Avg Rating</span>
                <span className="text-sm font-semibold flex items-center gap-1" data-testid="text-avg-rating">
                  <Star className="w-3 h-3 text-amber-400" /> {listings.averageRating}
                </span>
              </div>
            </div>
          </Card>

          <Card className="glass-card rounded-xl p-5" data-testid="section-labs-apps">
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-5 h-5 text-zinc-400" />
              <h2 className="text-lg font-semibold">Review Packages</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-zinc-400">Prepared</span>
                <span className="text-sm font-semibold" data-testid="text-published-apps">{apps.publishedApps} / {apps.totalApps}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-zinc-400">Sandbox Installs</span>
                <span className="text-sm font-semibold" data-testid="text-total-installs">{apps.totalInstalls}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-zinc-400">Avg Rating</span>
                <span className="text-sm font-semibold flex items-center gap-1" data-testid="text-apps-rating">
                  <Star className="w-3 h-3 text-amber-400" /> {apps.averageRating}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-zinc-400">Payouts</span>
                <Badge className={cn("text-[10px]", payoutAccount.exists ? "bg-amber-500/20 text-amber-300" : "bg-zinc-700 text-zinc-400")} data-testid="badge-payout">
                  Disabled
                </Badge>
              </div>
            </div>
          </Card>
        </div>

        <Card className="glass-card rounded-xl p-6" data-testid="section-forecast">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold">6-Month Readiness Forecast</h2>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {(forecast || []).map((f: any, i: number) => {
              const maxRev = Math.max(...(forecast || []).map((x: any) => x.revenue), 1);
              const height = (f.revenue / maxRev) * 100;
              return (
                <div key={i} className="text-center" data-testid={`forecast-${i}`}>
                  <div className="h-24 flex items-end justify-center mb-1">
                    <div
                      className="w-8 rounded-t bg-gradient-to-t from-violet-600 to-violet-400"
                      style={{ height: `${Math.max(height, 5)}%` }}
                  />
                </div>
                  <p className="text-xs font-mono font-semibold">Preview</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{f.month}</p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="glass-card rounded-xl p-6" data-testid="section-recommendations">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold">Readiness Recommendations</h2>
          </div>
          <div className="space-y-3">
            {(recommendations || []).map((rec: any) => (
              <div
                key={rec.id}
                className={cn("rounded-lg p-4 border", severityColors[rec.severity])}
                data-testid={`recommendation-${rec.id}`}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px]", severityBadge[rec.severity])}>
                      {rec.type}
                    </Badge>
                    <h3 className="text-sm font-semibold">{rec.title}</h3>
                  </div>
                  {rec.estimatedGain > 0 && (
                    <Badge variant="outline" className="text-[10px] px-2 border-emerald-500/30 text-emerald-400">
                      Potential signal
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
          Recommendation-only mode. No payable balance, production marketplace transaction, or payout is created here.
        </div>
      </div>
    </Layout>
  );
}
