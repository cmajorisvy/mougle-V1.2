import { Layout } from "@/components/layout/Layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CreditCard, Zap, Crown, Check, ArrowUpRight, ArrowDownRight,
  Receipt, TrendingUp, Sparkles, Shield, Star, ChevronRight, Download,
  Bot, MessageSquare, Swords, Video, Megaphone, Lock
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

const ACTION_ICONS: Record<string, any> = {
  ai_response: Bot,
  debate_basic: Swords,
  debate_premium: Swords,
  debate_expert: Swords,
  promotion_boost: Megaphone,
  video_generation: Video,
  agent_participation: Bot,
  premium_feature: Lock,
};

const ACTION_LABELS: Record<string, string> = {
  ai_response: "AI Response",
  debate_basic: "Basic Debate",
  debate_premium: "Premium Debate",
  debate_expert: "Expert Debate",
  promotion_boost: "Promotion Boost",
  video_generation: "Video Generation",
  agent_participation: "Entity Participation",
  premium_feature: "Premium Feature",
};

function PlanCard({ plan, currentPlan, onSubscribe, isLoading }: { plan: any; currentPlan: string | null; onSubscribe: (name: string) => void; isLoading: boolean }) {
  const isCurrent = currentPlan === plan.name;
  const isPopular = plan.name === "pro";
  const isFree = plan.name === "free";

  return (
    <Card className={cn(
      "relative bg-card/30 border-white/[0.06] transition-all hover:border-white/[0.12]",
      isCurrent && "border-primary/30 bg-primary/5",
      isPopular && !isCurrent && "border-purple-500/20 bg-purple-500/5"
    )} data-testid={`card-plan-${plan.name}`}>
      {isPopular && !isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-purple-500 text-white text-[10px] px-3">Most Popular</Badge>
        </div>
      )}
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-white text-[10px] px-3">Current Plan</Badge>
        </div>
      )}
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="text-lg font-display font-bold" data-testid={`text-plan-name-${plan.name}`}>{plan.displayName}</h3>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-bold font-mono">${(plan.priceMonthly / 100).toFixed(0)}</span>
            {!isFree && <span className="text-sm text-muted-foreground">/mo</span>}
          </div>
          {!isFree && plan.priceYearly > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              ${(plan.priceYearly / 100 / 12).toFixed(0)}/mo billed yearly (save {Math.round((1 - plan.priceYearly / (plan.priceMonthly * 12)) * 100)}%)
            </p>
          )}
        </div>

        <div className="space-y-2">
          {(plan.features as string[])?.map((feature: string, i: number) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
              <span className="text-foreground/80">{feature}</span>
            </div>
          ))}
        </div>

        <Button
          className={cn(
            "w-full h-9 text-sm",
            isCurrent ? "bg-white/[0.06] text-muted-foreground cursor-default" :
            isPopular ? "bg-purple-500 hover:bg-purple-600" :
            "bg-primary hover:bg-primary/90"
          )}
          disabled={isCurrent || isLoading}
          onClick={() => !isCurrent && onSubscribe(plan.name)}
          data-testid={`button-subscribe-${plan.name}`}
        >
          {isCurrent ? "Current Plan" : isFree ? "Downgrade" : "Upgrade"}
        </Button>
      </CardContent>
    </Card>
  );
}

function CreditPackageCard({ pkg, onPurchase, isLoading }: { pkg: any; onPurchase: (id: string) => void; isLoading: boolean }) {
  return (
    <Card className={cn(
      "bg-card/30 border-white/[0.06] hover:border-white/[0.12] transition-all",
      pkg.popular && "border-primary/20 bg-primary/5"
    )} data-testid={`card-package-${pkg.id}`}>
      {pkg.popular && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-white text-[9px] px-2">Best Value</Badge>
        </div>
      )}
      <CardContent className="p-4 space-y-3 text-center relative">
        <div className="p-2.5 rounded-xl bg-primary/10 w-fit mx-auto">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">{pkg.name}</h4>
          <div className="flex items-baseline justify-center gap-1 mt-1">
            <span className="text-2xl font-bold font-mono text-primary">{pkg.credits}</span>
            <span className="text-xs text-muted-foreground">credits</span>
          </div>
          {pkg.bonusCredits > 0 && (
            <Badge variant="outline" className="text-[9px] mt-1 border-emerald-500/20 text-emerald-400 bg-emerald-500/5">
              +{pkg.bonusCredits} bonus
            </Badge>
          )}
        </div>
        <div className="text-xl font-bold font-mono">${(pkg.priceUsd / 100).toFixed(0)}</div>
        <Button
          size="sm"
          className="w-full h-8 text-xs"
          onClick={() => onPurchase(pkg.id)}
          disabled={isLoading}
          data-testid={`button-buy-${pkg.id}`}
        >
          Add Credits
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Billing() {
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id || null;
  const [activeTab, setActiveTab] = useState("overview");

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["/api/billing/summary", userId],
    queryFn: () => userId ? api.billing.summary(userId) : null,
    enabled: !!userId,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["/api/billing/plans"],
    queryFn: () => api.billing.plans(),
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["/api/billing/credit-packages"],
    queryFn: () => api.billing.creditPackages(),
  });

  const { data: creditCosts } = useQuery({
    queryKey: ["/api/billing/credit-costs"],
    queryFn: () => api.billing.creditCosts(),
  });

  const { data: invoicesList = [] } = useQuery({
    queryKey: ["/api/billing/invoices", userId],
    queryFn: () => userId ? api.billing.invoices(userId) : [],
    enabled: !!userId,
  });

  const { data: usageStats } = useQuery({
    queryKey: ["/api/billing/usage", userId],
    queryFn: () => userId ? api.billing.usage(userId) : null,
    enabled: !!userId,
  });

  const purchaseMutation = useMutation({
    mutationFn: (packageId: string) => api.billing.purchaseCredits(userId!, packageId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      toast({ title: "Credits added", description: `${data.purchase.creditsBought} compute credits added.` });
    },
    onError: (err: Error) => toast({ title: "Purchase failed", description: err.message, variant: "destructive" }),
  });

  const subscribeMutation = useMutation({
    mutationFn: (planName: string) => api.billing.subscribe(userId!, planName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      toast({ title: "Subscription updated!", description: "Your plan has been changed." });
    },
    onError: (err: Error) => toast({ title: "Subscription failed", description: err.message, variant: "destructive" }),
  });

  const currentPlanName = summary?.subscription?.plan?.name || "free";

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold" data-testid="text-billing-title">Billing & Credits</h1>
            <p className="text-sm text-muted-foreground">Manage subscriptions, compute credits, and invoices. Gluon is a separate contribution credit and is not billed or spendable here.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {summaryLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="bg-card/30 border-white/[0.06] p-4"><Skeleton className="w-full h-16" /></Card>
            ))
          ) : (
            <>
              <Card className="bg-card/40 border-white/[0.06] p-4" data-testid="card-balance">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10"><CreditCard className="w-4 h-4 text-primary" /></div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Compute Credits</p>
                    <p className="text-2xl font-bold font-mono text-primary" data-testid="text-balance">{summary?.balance || 0}</p>
                    <p className="text-[10px] text-muted-foreground">credits</p>
                  </div>
                </div>
              </Card>
              <Card className="bg-card/40 border-white/[0.06] p-4" data-testid="card-plan">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-500/10"><Crown className="w-4 h-4 text-purple-400" /></div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Plan</p>
                    <p className="text-lg font-bold capitalize" data-testid="text-current-plan">{currentPlanName}</p>
                    {summary?.subscription?.isActive && (
                      <Badge variant="outline" className="text-[9px] h-4 border-emerald-500/20 text-emerald-400 bg-emerald-500/5">Active</Badge>
                    )}
                  </div>
                </div>
              </Card>
              <Card className="bg-card/40 border-white/[0.06] p-4" data-testid="card-spent">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/10"><TrendingUp className="w-4 h-4 text-amber-400" /></div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Spent</p>
                    <p className="text-2xl font-bold font-mono" data-testid="text-total-spent">{summary?.totalSpent || 0}</p>
                    <p className="text-[10px] text-muted-foreground">credits used</p>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-white/[0.04] border border-white/[0.06]">
            <TabsTrigger value="overview" className="text-xs" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="plans" className="text-xs" data-testid="tab-plans">Plans</TabsTrigger>
            <TabsTrigger value="credits" className="text-xs" data-testid="tab-credits">Buy Credits</TabsTrigger>
            <TabsTrigger value="invoices" className="text-xs" data-testid="tab-invoices">Invoices</TabsTrigger>
            <TabsTrigger value="usage" className="text-xs" data-testid="tab-usage">Usage</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-card/30 border-white/[0.06]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> Credit Costs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {creditCosts && Object.entries(creditCosts).map(([key, cost]) => {
                    const Icon = ACTION_ICONS[key] || Zap;
                    return (
                      <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]" data-testid={`cost-${key}`}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm">{ACTION_LABELS[key] || key}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono border-primary/20 text-primary bg-primary/5">
                          {cost as number} credits
                        </Badge>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="bg-card/30 border-white/[0.06]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Receipt className="w-4 h-4 text-amber-400" /> Recent Activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {summary?.recentUsage?.length > 0 ? summary.recentUsage.slice(0, 8).map((u: any) => (
                    <div key={u.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                      <div className="flex items-center gap-2 min-w-0">
                        <ArrowDownRight className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{u.actionLabel || u.actionType}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {u.createdAt && formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-red-400">-{u.creditsUsed}</span>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="plans" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.sort((a: any, b: any) => a.sortOrder - b.sortOrder).map((plan: any) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  currentPlan={currentPlanName}
                  onSubscribe={(name) => subscribeMutation.mutate(name)}
                  isLoading={subscribeMutation.isPending}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="credits" className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {packages.map((pkg: any) => (
                <CreditPackageCard
                  key={pkg.id}
                  pkg={pkg}
                  onPurchase={(id) => purchaseMutation.mutate(id)}
                  isLoading={purchaseMutation.isPending}
                />
              ))}
            </div>
            <Card className="bg-card/20 border-white/[0.04] p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="w-3.5 h-3.5" />
                <span>Compute credit billing is separate from Gluon. Credit purchase availability depends on configured payment providers and does not create Gluon, GVI, payout, or redemption value.</span>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="space-y-2">
            {invoicesList.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Receipt className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No invoices yet</p>
              </div>
            ) : (
              invoicesList.map((inv: any) => (
                <Card key={inv.id} className="bg-card/30 border-white/[0.04] p-4 flex items-center justify-between" data-testid={`card-invoice-${inv.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-white/[0.04]">
                      <Receipt className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium font-mono" data-testid={`text-invoice-number-${inv.id}`}>{inv.invoiceNumber}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{inv.type?.replace(/_/g, " ")} · {inv.createdAt && formatDistanceToNow(new Date(inv.createdAt), { addSuffix: true })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={cn(
                      "text-[9px]",
                      inv.status === "paid" ? "border-emerald-500/20 text-emerald-400" : "border-amber-500/20 text-amber-400"
                    )}>
                      {inv.status}
                    </Badge>
                    <span className="text-sm font-bold font-mono">${(inv.amount / 100).toFixed(2)}</span>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid={`button-download-${inv.id}`}>
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="usage" className="space-y-4">
            {usageStats ? (
              <div className="space-y-4">
                <Card className="bg-card/30 border-white/[0.06] p-4">
                  <h3 className="text-sm font-semibold mb-3">Usage Breakdown</h3>
                  <div className="space-y-3">
                    {usageStats.breakdown && Object.entries(usageStats.breakdown).map(([type, data]: [string, any]) => {
                      const Icon = ACTION_ICONS[type] || Zap;
                      const maxCredits = usageStats.total || 1;
                      const pct = Math.round((data.total / maxCredits) * 100);
                      return (
                        <div key={type} className="space-y-1" data-testid={`usage-${type}`}>
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              <span>{ACTION_LABELS[type] || type}</span>
                            </div>
                            <span className="font-mono text-muted-foreground">{data.total} credits ({data.count}x)</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                            <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
                <Card className="bg-card/30 border-white/[0.06] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Total Credits Used</h3>
                    <span className="text-2xl font-bold font-mono text-primary" data-testid="text-total-usage">{usageStats.total}</span>
                  </div>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No usage data yet</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
